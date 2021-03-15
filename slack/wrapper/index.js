const BaseServer = require('../../common/BaseServer');
const {createProxyMiddleware} = require('http-proxy-middleware');
const Axios = require('axios');
const Template = require("../views/Template");
const Env = require("../../utils/Env");
const {decodeJWT} = require('../../utils/Crypto');
const Express = require('express');

const {
  handlerOptionLogin,
  configUrlAuthGoogle,
  configUrlAuthMicrosoft,
  configViewSetting,
  queryChannelGoogleCalendar,
  queryChannelMicrosoftCalendar,
} = require("./ChatService");

function onProxyReq(proxyReq, req, res) {
  if (req.body) {
    let bodyData = JSON.stringify(req.body);
    proxyReq.setHeader('Content-Type', 'application/json');
    proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
    proxyReq.write(bodyData);
  }
}

const option = {
  onProxyReq: onProxyReq,
  pathRewrite: function (path, req) {
    return path.replace(/^\/dev-slack-0001/, '')
  },
};

const proxyGO = createProxyMiddleware(
  '/',
  {
    target: 'http://localhost:5001',
    ...option,
  });
const proxyMI = createProxyMiddleware(
  '/',
  {
    target: 'http://localhost:5002',
    ...option,
  });

class SlackWrapper extends BaseServer {
  constructor(instanceId, opt) {
    super(instanceId, opt);
    this.loginWrapper = this.loginWrapper.bind(this);
    this.loginGoogle = this.loginGoogle.bind(this);
    this.loginMicrosoft = this.loginMicrosoft.bind(this);
    this.template = Template();
    this.proxyGO = proxyGO;
    this.proxyMI = proxyMI;
  }

  /**
   *
   * @param {object} req
   * @param {object} res
   * @returns {Promise}
   */
  async handlerEvent(req, res) {
    try {
      let {event, authorizations} = req.body;
      const {user_id} = authorizations[0];

      const types = Env.chatServiceGOF("TYPE");
      let option = null;

      const {loginResource} = this.template;
      switch (event.subtype) {
        case types.BOT_ADD:
        case types.APP_JOIN:
          option = handlerOptionLogin(event, loginResource, this.setUidToken);
          break;
        case types.CHANNEL_JOIN:
          if (user_id === event.user) option = handlerOptionLogin(event, loginResource, this.setUidToken);
          break;
        default:
          break;
      }

      if (option) await Axios(option)
        .then(({data}) => {if (!data.ok) throw data});

      return res.status(200).send("OK");
    } catch (e) {
      console.log("⇒⇒⇒ Handler Event ERROR: ", e);
      return res.status(204).send("ERROR");
    }
  }

  async handlerSetting(template, body) {
    const google = await queryChannelGoogleCalendar(body.channel_id);
    const microsoft = await queryChannelMicrosoftCalendar(body.channel_id);
    const goAccount = google ? google.account : [];
    const miAccount = microsoft ? microsoft.account : [];

    const view = configViewSetting(
      this.setUidToken,
      template,
      body.channel_id,
      goAccount,
      miAccount,
    );

    const option = {
      method: "POST",
      headers: {Authorization: `Bearer ${Env.chatServiceGOF("BOT_TOKEN")}`},
      data: {
        trigger_id: body.trigger_id,
        view,
      },
      url:
        Env.chatServiceGet("API_URL") +
        Env.chatServiceGet("API_VIEW_OPEN"),
    };

    return option
  }

  handlerShowEvents(body) {
    // console.log("handlerShowEvents body: ", body);
    return null
  }

  async handleCommand(req, res, next) {
    try {
      let text = req.body.text.trim();
      let option = null;
      switch (text) {
        case "setting":
          option = await this.handlerSetting(this.template, req.body);
          break;
        case "show-events":
          option = await this.handlerShowEvents(req.body);
          break;
        default:
          option = null;
          break;
      }
      if (option) await Axios(option)
        .then(({data}) => {
          if (!data.ok) throw data
        });
      return res.status(200).send("OK");
    } catch (e) {
      console.log("⇒⇒⇒ Handler Command ERROR: ", e);
      return res.status(204).send("Command error");
    }
  }

  getDataServer(actions) {
    const list = Env.serverGOF("LIST");
    let param = "block_id";
    if (/^WR_/.test(actions[0].block_id)) param = "action_id";
    for (let i = 0, length = list.length; i < length; i++) {
      const {prefix} = list[i];
      const regex = new RegExp(`^${prefix}_`);
      for (let j = 0, length = actions.length; j < length; j++) {
        if (regex.test(actions[j][param])) return list[i]
      }
    }
  }

  async chatServiceHandler(req, res, next) {
    let {challenge, event, payload, command} = req.body;
    try {
      if (challenge) return res.status(200).send(challenge);
      if (event) return this.handlerEvent(req, res);
      if (/\/cal/.test(command)) {
        if (/^go/.test(req.body.text)) return this.proxyGO(req, res, next);
        if (/^mi/.test(req.body.text)) return this.proxyMI(req, res, next);
        return this.handleCommand(req, res, next);
      }
      if (payload) {
        payload = JSON.parse(payload);
        const {actions, view} = payload;
        if (view && view.callback_id && /^GO_/.test(view.callback_id)) return this.proxyGO(req, res, next);
        if (view && view.callback_id && /^MI_/.test(view.callback_id)) return this.proxyMI(req, res, next);
        const data = this.getDataServer(actions);
        if (data && data.PORT === 5001) return this.proxyGO(req, res, next);
        if (data && data.PORT === 5002) return this.proxyMI(req, res, next);
      }
      console.log("⇒⇒⇒ Chat Server Handler ERROR: not proxy ", req.body);
      return res.status(200).send("OK");
    } catch (e) {
      console.log("⇒⇒⇒ Chat Server Handler ERROR: ", e);
      return res.status(400).send("ERROR");
    }
  }

  resourceServerHandler(req, res, next) {
    try {
      let regexGO = /^x-goog/;
      for (let value in req.headers) {
        if (regexGO.test(value)) {
          return this.proxyGO(req, res, next);
        }
      }
      return this.proxyMI(req, res, next);
    } catch (e) {
      console.log("⇒⇒⇒ Resource Server Handler ERROR: ", e);
      return res.status(204).send("ERROR")
    }
  }

  async loginWrapper(req, res, next) {
    const {accessToken = "", redirect = ""} = req.query;
    try {
      if (!accessToken || !redirect) return res.status(400).send("Bad request");
      decodeJWT(accessToken);
      switch (redirect) {
        case "GOOGLE":
          return res.status(307).redirect(configUrlAuthGoogle(accessToken));
        case "MICROSOFT":
          return res.status(307).redirect(configUrlAuthMicrosoft(accessToken));
        default:
          return res.status(400).send("Bad request");
      }
    } catch (e) {
      console.log("⇒⇒⇒ Login Wrapper ERROR: ", e);
      if (e.code === "TokenExpiredError") return res.status(401).send(e.message);
      return res.status(400).send("Bad request");
    }
  }

  pushMessageHandler(req, res, next) {

  }

  loginGoogle(req, res, next) {
    return this.proxyGO(req, res, next);
  }

  loginMicrosoft(req, res, next) {
    return this.proxyMI(req, res, next);
  }
}

module.exports = SlackWrapper;

(async function () {
  await Template().init(process.argv[2]);
  const wrapper = new SlackWrapper(process.argv[2], {
    config: {
      path: process.argv[3],
      appRoot: __dirname,
    },
  });
  await wrapper.init();
  wrapper.app.post('/dev-slack-0001/watch/chat-service', wrapper.chatServiceHandler);
  wrapper.app.post('/dev-slack-0001/watch/resource-server', wrapper.resourceServerHandler);
  wrapper.app.post('/dev-slack-0001/push/message', wrapper.pushMessageHandler);
  wrapper.app.get("/dev-slack-0001/login-wrapper", wrapper.loginWrapper);
  wrapper.app.get("/dev-slack-0001/auth/google", wrapper.loginGoogle);
  wrapper.app.get("/dev-slack-0001/auth/microsoft", wrapper.loginMicrosoft);
  wrapper.app.use('/dev-slack-0001/public', Express.static(Env.appRoot + '/public'));
})();
