const BaseServer = require('../../common/BaseServer');
const httpProxy = require('http-proxy');
const Axios = require('axios');
const Template = require("../views/Template");
const Env = require("../../utils/Env");
const {decodeJWT} = require('../../utils/Crypto');

const {
	handlerOptionLogin,
	configUrlAuthGoogle,
	configUrlAuthMicrosoft,
} = require("./ChatService");

const proxy = httpProxy.createProxyServer({});

proxy.on('proxyReq', function (proxyReq, req) {
	if (req.body) {
		let bodyData = JSON.stringify(req.body);
		proxyReq.setHeader('Content-Type', 'application/json');
		proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
		proxyReq.write(bodyData);
	}
});

class SlackWrapper extends BaseServer {
	constructor(instanceId, opt) {
		super(instanceId, opt);
		this.loginWrapper = this.loginWrapper.bind(this);
		this.template = Template();
	}

	/**
	 *
	 * @param {object} event
	 * @param {string} user_id
	 * @returns {Promise}
	 */
	handlerEvent(event, user_id) {
		const {subtype} = event;
		const types = Env.chatServiceGOF("TYPE");
		const {loginResource} = this.template;
		switch (subtype) {
			case types.BOT_ADD:
			case types.APP_JOIN:
				return handlerOptionLogin(event, loginResource, this.setUidToken);
			case types.CHANNEL_JOIN:
				if (user_id === event.user) return handlerOptionLogin(event, loginResource, this.setUidToken);
				return null;
			default:
				return null;
		}
	}

	getDataServer(actions) {
		const list = Env.serverGOF("LIST");
		for (let i = 0, length = list.length; i < length; i++) {
			const {prefix} = list[i];
			for (let j = 0, length = actions.length; j < length; j++) {
				const regex = new RegExp(`^${prefix}_`);
				if (regex.test(actions[j].action_id)) return list[i]
			}
		}
	}

	async chatServiceHandler(req, res, next) {
		let {challenge = null, event = null, payload = null, command = null, authorizations = null} = req.body;
		try {
			if (challenge) {
				return res.status(200).send(challenge);
			}
			if (event) {
				const {user_id = ""} = authorizations[0];
				const config = this.handlerEvent(event, user_id);
				if (config) await Axios(config);
				return res.status(200).send("OK");
			}
			if(/\/cal/.test(command) && /^google/.test(req.body.text)){
        proxy.web(req, res, {target: 'http://localhost:5001'})
      }
			if (payload) {
				payload = JSON.parse(payload);
				const {actions} = payload;
				const data = this.getDataServer(actions);
				proxy.web(req, res, {target: `http://localhost:${data.PORT}`})
			}
		} catch (e) {
			return res.status(400).send("ERROR");
		}
	}

	resourceServerHandler(req, res, next) {
		try {
		  let proxyGoogle = false;
      let regexGO = /^x-goog/;
		  for(let value in req.headers){
		    if(regexGO.test(value)){
          proxy.web(req, res, {
            target: 'http://localhost:5001'
          });
          proxyGoogle = true;
		      break
		    }
      }
		  if(!proxyGoogle) proxy.web(req, res, {
        target: 'http://localhost:5002'
      });
		} catch (e) {
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
			return res.status(400).send("Bad request");
		}
	}

	loginGoogle(req, res, next) {
		proxy.web(req, res, {
			target: `http://localhost:${Env.serverGOF("GOOGLE_PORT")}`
		})
	}

	loginMicrosoft(req, res, next) {
		proxy.web(req, res, {
			target: `http://localhost:${Env.serverGOF("MICROSOFT_PORT")}`
		})
	}
}

module.exports = SlackWrapper;

(async function () {
	const wrapper = new SlackWrapper(process.argv[2], {
		config: {
			path: process.argv[3],
			appRoot: __dirname,
		},
	});
	await Template().init();
	await wrapper.init();
	wrapper.app.get("/login-wrapper", wrapper.loginWrapper);
	wrapper.app.get("/auth/google", wrapper.loginGoogle);
	wrapper.app.get("/auth/microsoft", wrapper.loginMicrosoft);
})();
