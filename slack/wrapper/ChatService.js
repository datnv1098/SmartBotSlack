const Env = require("../../utils/Env");
const {createJWT} = require('../../utils/Crypto');
const {v4: uuidv4} = require('uuid');
const Channel = require("../../models/Channel");

/**
 * Cấu hình đường dẫn redirect login google
 * @returns {string} url
 */
const configUrlAuthGoogle = (accessToken) => {
  let url = Env.resourceServerGOF('GO_API_OAUTH');
  url += `?scope=${Env.resourceServerGOF("GO_SCOPE_CALENDAR")}`;
  url += `+${Env.resourceServerGOF("GO_SCOPE_USER_INFO")}`;
  url += `&access_type=${Env.resourceServerGOF("GO_ACCESS_TYPE")}`;
  url += `&response_type=${Env.resourceServerGOF("GO_RESPONSE_TYPE")}`;
  url += `&client_id=${Env.resourceServerGOF("GO_CLIENT_ID")}`;
  url += `&redirect_uri=${Env.resourceServerGOF("GO_REDIRECT_URI")}`;
  url += `&state=${accessToken}`;
  return url
};

/**
 * Cấu hình đường dẫn redirect login Microsoft
 * @returns {string} urlRequestAuthor
 */
const configUrlAuthMicrosoft = (accessToken) => {
  let url = Env.resourceServerGet("MI_API_URL_AUTH");
  url += Env.resourceServerGet("MI_API_AUTHOR");
  url += `?scope=${encodeURIComponent(Env.resourceServerGet("MI_SCOPE"))}`;
  url += `&response_type=${Env.resourceServerGOF("MI_RESPONSE_TYPE")}`;
  url += `&response_mode=${Env.resourceServerGOF("MI_RESPONSE_MODE")}`;
  url += `&client_id=${Env.resourceServerGet("MI_AZURE_ID")}`;
  url += `&redirect_uri=${Env.resourceServerGet("MI_AZURE_REDIRECT")}`;
  url += `&state=${accessToken}`;
  return url;
};

const configButtonLogin = (setUidToken, channel, type) => {
  const btnLogin = {
    "type": "button",
    "text": {
      "type": "plain_text",
      "emoji": true,
      "text": `${type === "GO" ? "Login Google" : "Login microsoft"}`
    },
    "style": "primary",
    "action_id": `${type === "GO" ? "GO_loginGoogle" : "MI_loginMicrosoft"}`
  };
  const iat = Math.floor(new Date() / 1000);
  const payload = {
    uid: uuidv4(),
    idChannel: channel,
    iat,
    exp: iat + parseInt(Env.getOrFail("JWT_DURATION"))
  };
  const accessToken = createJWT(payload);
  let urlLogin = Env.resourceServerGOF("URL");
  urlLogin += "/dev-slack-0001";
  urlLogin += `${Env.resourceServerGOF("URI_LOGIN")}`;
  urlLogin += `?accessToken=${accessToken}&redirect=`;
  urlLogin += `${type === "GO" ? "GOOGLE" : "MICROSOFT"}`;
  btnLogin.url = urlLogin;
  setUidToken(payload.uid);
  return btnLogin
};

/**
 * Thực thi việc requestLogin gửi về một Post Message
 * @param {object} event
 * @param {array} view
 * @param {function} setUidToken
 * @returns {object}
 */
const handlerOptionLogin = (event, view, setUidToken) => {
  const viewLogin = [...view];
  const option = {};
  option.method = "POST";
  option.url = Env.chatServiceGOF('API_URL');
  option.url += Env.chatServiceGOF('API_POST_MESSAGE');
  option.headers = {'Authorization': `Bearer ${Env.chatServiceGet("BOT_TOKEN")}`};
  const {channel} = event;
  viewLogin[2].elements[0] = configButtonLogin(setUidToken, channel, "GO");
  viewLogin[2].elements[1] = configButtonLogin(setUidToken, channel, "MI");
  option.data = {
    "channel": channel,
    "blocks": viewLogin
  };
  return option;
};

const handlerItemCalendar = (type, calendar, watch) => {
  const option = {
    "text": {
      "type": "plain_text",
      "text": "✓ watching",
      "emoji": true
    },
    "value": `watch|${watch}`
  };
  return {
    "type": "section",
    "block_id": `${type}_CALENDAR_${calendar.id}`,
    text: {
      "type": "mrkdwn",
      "text": `Calendar: *${calendar.name}* - ${watch ? "\`Watching\`" : "\`Not watch\`"}`
    },
    accessory: {
      "type": "overflow",
      "action_id": `${type}_setting-calendar|${calendar.id}`,
      options: [{...option}]
    }
  }
};

const handlerAccount = (type, account) => {
  const serviceName = type === "GO" ? "GOOGLE       " : "MICROSOFT";
  return {
    "block_id": `${type}_ACCOUNT_${account.id}`,
    "type": "section",
    "text": {
      "type": "mrkdwn",
      "text": `${serviceName} ★ *${account.mail}*`
    },
    "accessory": {
      "type": "button",
      "text": {
        "type": "plain_text",
        "text": "Log out"
      },
      "style": "danger",
      "value": "account.id",
      "action_id": `${type}_logout`
    }
  }
};

const handlerViewSetting = (type, account) => {
  const {calendar} = account;
  const acc = handlerAccount(type, account);
  const result = [acc];
  for (let i = 0, length = calendar.length; i < length; i++) {
    const cal = handlerItemCalendar(type, calendar[i], calendar[i].watch[0].watch);
    result.push(cal)
  }
  result.push({"type": "divider"});
  return result
};

const configViewSetting = (setUidToken, template, idChannel, google, microsoft) => {

  let view = {
    ...template.systemSetting,
    blocks: [...template.systemSetting.blocks]
  };
  view.blocks[2].elements[0] = configButtonLogin(setUidToken, idChannel, "GO");
  view.blocks[2].elements[1] = configButtonLogin(setUidToken, idChannel, "MI");
  // view.blocks.splice(5, 1);

  for (let i = 0, length = microsoft.length; i < length; i++) {
    const block = handlerViewSetting("MI", microsoft[i]);
    view.blocks.splice(2, 0, ...block);
  }

  for (let i = 0, length = google.length; i < length; i++) {
    const block = handlerViewSetting("GO", google[i]);
    view.blocks.splice(2, 0, ...block);
  }

  view.blocks.splice(1, 1);
  return view;
}

const _builderChannelCalendar = (service) => {
  return {
    account: {
      $relation: `channel_${service}_account`,
      $modify: ["whereAccount"],
      calendar: {
        $relation: `${service}_calendar`,
        watch: {
          $relation: `channel_${service}_calendar`,
          $modify: ["whereChannel"],
        }
      }
    }
  }
};

const queryChannelGoogleCalendar = (idChannel) => {
  return Channel.query()
    .findById(idChannel)
    .withGraphFetched(_builderChannelCalendar("google"))
    .modifiers({
      whereAccount(builder) {
        builder.select('id', "mail");
      },
      whereChannel(builder) {
        builder.select('watch');
        builder.findOne("id_channel", idChannel);
      }
    });
};

const queryChannelMicrosoftCalendar = (idChannel) => {
  return Channel.query()
    .findById(idChannel)
    .withGraphFetched(_builderChannelCalendar("microsoft"))
    .modifiers({
      whereAccount(builder) {
        builder.select('id', "mail");
      },
      whereChannel(builder) {
        builder.select('watch');
        builder.findOne("id_channel", idChannel);
      }
    });
};

module.exports = {
  handlerOptionLogin,
  configUrlAuthGoogle,
  configUrlAuthMicrosoft,
  configButtonLogin,
  configViewSetting,
  queryChannelGoogleCalendar,
  queryChannelMicrosoftCalendar,
};
