const BaseServer = require("../../common/BaseServer");
const Env = require("../../utils/Env");
const Redis = require("../../utils/redis");
const { cryptoDecode, decodeJWT } = require("../../utils/Crypto");
const Template = require("../views/Template");
const AxiosConfig = require('./Axios');
const Axios = require('axios');
const MicrosoftCalendar = require("../../models/MicrosoftCalendar");
const ChannelsCalendar = require("../../models/ChannelsCalendar");
const MicrosoftAccountCalendar = require("../../models/MicrosoftAccountCalendar");
const MicrosoftAccount = require("../../models/MicrosoftAccount");
const Channel = require("../../models/Channel");
const _ = require('lodash');
const Moment = require('moment');
const MomentTimezone = require('moment-timezone');

const {
  getToken,
  getListCalendar,
  getProfileUser,
  saveUserProfile,
  saveCalendar,
  saveInfoChannel,
  saveAccountCalendar,
  saveChannelCalendar,
  saveChannelAccount,
  saveChannelMicrosoftCalendar,
} = require("./Auth");
const {
  sendMessageLogin,
  handlerSettingsMessage,
  configAddEvent,
  handlerBlocksActions,
  submitAddEvent,
  submitDelEvent,
  getEventsTodays,
  convertBlocksEvents
} = require("./HandlerChatService");
const {
  handlerData,
  getEvent,
} = require("./HandlerResourceServer");

class SlackMicrosoft extends BaseServer {
  constructor(instanceId, opt) {
    super(instanceId, opt);
    this.microsoftAccess = this.microsoftAccess.bind(this);
    this.template = Template();
  }

  /**
   * Xử lý sự kện add event
   * @param {object} body
   * @return {Promise<{object}>}
   */
  async handlerAddEvent(body) {
    const { user_id } = body;
    body.userInfo = await this.getUserInfo(user_id);
    body.calendars = await this.getCalendarsInChannel(body.channel_id);
    return configAddEvent(body, this.template)
  }

  /**
   * Xử lý event
   * @param {object} req
   * @param {object} res
   */
  async handlerEvent(req, res) {
    try {
      let { event, authorizations } = req.body;
      const types = Env.chatServiceGOF("TYPE");
      let option = null;
      switch (event.subtype) {
        case types.BOT_ADD:
        case types.APP_JOIN:
          option = sendMessageLogin(event, this.template, this.setUidToken);
          break;
        case types.CHANNEL_JOIN:
          if (authorizations[0].user_id === event.user) {
            option = sendMessageLogin(event, this.template, this.setUidToken);
          }
          break;
        default:
          break;
      }
      if (option) await Axios(option).then(({ data }) => {
        if (!data.ok) throw data
      });

      return res.status(200).send("OK");
    } catch (e) {
      console.log("⇒⇒⇒ Handler Event ERROR: ", e);
      return res.status(204).send("Error");
    }
  }

  /**
   * get events in calendar
   * @param {string} idAccount
   * @param {string} idCalendar
   * @returns {Object} option
   */
  getEventsInCalendar = (idAccount, idCalendar) => {
    const options = {
      method: 'GET',
      headers: { 'X-Microsoft-AccountId': idAccount },
      url:
        Env.resourceServerGOF("GRAPH_URL") +
        Env.resourceServerGOF("GRAPH_CALENDARS") + `/${idCalendar}/events`
    };
    return options;
  }

  /**
 *
 * @param {Array} data
 * @param {Array} calendars
 * @param {object} account
 * @returns {Array}
 */
  convertEventsData = (events, account, calendar) => {
    const data = [];
    const values = events.data.value;
    console.log(events);
    if (values.length > 0) {
      values.forEach(item => {
        console.log("Item :", item);
        const event = _.pick(item, ['id', 'subject', 'start', 'end', 'location', 'recurrence', 'isAllDay']);
        event.nameCalendar = calendar.name;
        event.idCalendar = calendar.id;
        event.idAccount = account.id;
        event.timezone = account.timezone;
        data.push(event);
      });
    }
    return data;
  }
  /**
   * builder Get Account And Calendar
   * @param {string} idChannel
   * @returns
   */
  builderGetAccountCalendar(idChannel) {
    const queryBuilder = {
      account: {
        $relation: 'channel_microsoft_account',
        $modify: ["whereAccount"],
        calendar: {
          $relation: 'microsoft_calendar',
        }
      }
    }

    return Channel.query()
      .findById(idChannel)
      .withGraphFetched(queryBuilder)
      .modifiers({
        whereAccount(builder) {
          builder.select('id', "timezone");
        },
      });
  }

  /**
   * Sort array
   * @param {Array} array
   * @returns {Array}
   */
  sortTimeStart(array) {
    return array.sort(function (a, b) {
      return (new Date(a.start.dateTime)) - (new Date(b.start.dateTime));
    });
  }
  /**
   * sort And Set Data
   * @param {Array} events
   * @param {Array} eventRedis
   * @param {string} idCalendar
   * @param {number} exp
   */
  sortAndSetData(events, eventRedis, idCalendar, exp) {
    events = [...events, ...eventRedis];
    events = this.sortTimeStart(events);
    this.setValueRedis(`EVENT-TODAY_${idCalendar}`, JSON.stringify(eventRedis), exp);
    return events;
  }
  /**
   * Xử lý sự kện show Events Today
   * @param {object} body
   * @return {Promise<{object}>}
   */
  async handlerEventsToday(body) {
    const { channel_id } = body;
    const option = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Env.chatServiceGOF("BOT_TOKEN")}`,
      },
      data: {
        channel: channel_id,
      },
      url:
        Env.chatServiceGet("API_URL") +
        Env.chatServiceGet("API_POST_MESSAGE"),
    };
    try {
      let events = null;
      body.userInfo = await this.getUserInfo(body.user_id);
      events = [];
      const data = await this.builderGetAccountCalendar(channel_id);
      let dateTimeNow = Moment(new Date()).utc(true).utcOffset(body.userInfo.user.tz).format();
      const endToday = new Date(`${dateTimeNow.split("T")[0]}T23:59:59Z`);
      const dateToday = dateTimeNow.split("T")[0];
      dateTimeNow = new Date(dateTimeNow);
      const exp = (endToday - dateTimeNow) / 1000;
      let hours = MomentTimezone(new Date()).format("Z");
      hours = - parseInt(hours);
      const start = MomentTimezone(`${dateToday}T00:00:00Z`).utc(false).add(hours, "h").format();
      const end = MomentTimezone(`${dateToday}T23:59:59Z`).utc(false).add(hours, "h").format();

      // HAHAHAHA
      for (let i = 0; i < data.account.length; i++) {
        const account = data.account[i];
        if (account.calendar.length === 0) continue;
        for (let j = 0; j < account.calendar.length; j++) {
          const calendar = account.calendar[j];
          console.log(`1: EVENT-TODAY_${this.instanceId}_${calendar.id}`);
          let eventRedis = await this.getValueRedis(`EVENT-TODAY_${calendar.id}`);
          if (eventRedis) {
            eventRedis = JSON.parse(eventRedis);
            console.log("eventRedis :", eventRedis);
            if (eventRedis.length <= 0) continue;
            events = this.sortAndSetData(events, eventRedis, calendar.id, exp);
            continue;
          }
          eventRedis = await getEventsTodays(account, j, start, end);
          if (eventRedis.data.value.length === 0) continue;
          eventRedis = this.convertEventsData(eventRedis, account, calendar);
          events = this.sortAndSetData(events, eventRedis, calendar.id, exp);
        }
      }
      body.events = events;
      if (events.length === 0) {
        option.data.text = " You are free today ! ";
      } else {
        const blocksView = await convertBlocksEvents(body, this.template);
        option.data.blocks = blocksView;
      }
      return option;
    } catch (e) {
      console.log("⇒⇒⇒ handlerEventsToday ERROR: ", e);
      option.data.text = " Get event today fail ! Try again.";
      return option;
    }
  }

  /**
   * Xử lý command
   * @param {object} req
   * @param {object} res
   * @returns {Promise}
   */
  async handlerCommand(req, res) {
    try {
      res.status(202).send();
      let text = req.body.text.trim();
      let option = null;
      const { systemSetting } = this.template;
      switch (text) {
        case "settings":
          option = handlerSettingsMessage(systemSetting, req.body);
          break;
        case "mi add-event":
          option = await this.handlerAddEvent(req.body);
          break;
        case "mi event-today":
          option = await this.handlerEventsToday(req.body);
          break;
        default:
          option = null;
          break;
      }
      if (option) await Axios(option)
        .then(({ data }) => { if (!data.ok) throw data });
    } catch (e) {
      console.log("⇒⇒⇒ Handler Command ERROR: ", e);
      res.status(204).send("Command error");
    }
  }

  /**
   * Lấy danh sách calendar
   * @param {string} channelId
   * @return {Promise<[]>}
   */
  async getCalendarsInChannel(channelId) {
    const channelCalendar = await ChannelsCalendar.query().where({ id_channel: channelId });
    const calendars = [];
    const regex = /^MI_/;
    for (let i = 0, length = channelCalendar.length; i < length; i++) {
      if (regex.test(channelCalendar[i].id_calendar)) {
        const idCalendar = channelCalendar[i].id_calendar.replace(regex, "");
        const calendar = await MicrosoftCalendar.query().findById(idCalendar);
        calendars.push({
          "text": {
            "type": "plain_text",
            "text": calendar.name,
            "emoji": true
          },
          "value": calendar.id
        });
      }
    }
    return calendars
  }

  /**
   * lấy ra thông tin người dùng slack
   * @param {string} id
   * @return {Promise<unknown>}
   */
  getUserInfo(id) {
    return new Promise((resolve, reject) => {
      const option = {
        method: 'Get',
        headers: { 'Authorization': `Bearer ${Env.chatServiceGOF("BOT_TOKEN")}` },
        url: `${Env.chatServiceGOF("API_URL")}${Env.chatServiceGOF("API_USER_INFO")}?user=${id}`,
      };
      Axios(option)
        .then(res => {
          if (!res.data.ok) reject(res.data);
          resolve(res.data)
        })
        .catch(reject)
    })
  }

  /**
   * Get option for add or edit EVENT
   * @param {Object} payload
   * @param {string} type
   * @returns {object}
   */
  async getOptionEditOfAddEvent(payload, type) {
    let { values } = payload.view.state;
    const idCalendar = values["MI_select_calendar"]["select_calendar"]["selected_option"].value;
    const { id_account } = await MicrosoftAccountCalendar.query().findOne({ id_calendar: idCalendar });
    const account = await MicrosoftAccount.query().findOne({ id: id_account });
    const option = {
      method: 'POST',
      headers: { "Content-Type": "application/json", 'X-Microsoft-AccountId': id_account },
      data: submitAddEvent(values, account),
      url:
        Env.resourceServerGOF("GRAPH_URL") +
        Env.resourceServerGOF("GRAPH_CALENDARS") + `/${idCalendar}/events`
    };
    if (type === "edit") {
      option.method = "PATCH";
      const value = payload.view.callback_id.split('/');
      option.url += "/" + value[1];
    }
    return option;
  }

  /**
   *  Xu ly cac su kien nguoi dung goi lenh xu ly bot
   * @param {object} payload
   * @returns {Promise}
   */
  async handlerSubmit(payload) {
    let callbackId = payload.view.callback_id;
    let option = null;
    if (callbackId.indexOf('MI_edit-event') === 0) {
      callbackId = callbackId.split('/')[0];
    }
    switch (callbackId) {
      case "MI_delete-event":
        option = submitDelEvent(payload);
        break;
      case "MI_add-event":
        option = await this.getOptionEditOfAddEvent(payload, "add");
        break;
      case "MI_edit-event":
        option = await this.getOptionEditOfAddEvent(payload, "edit");
        break;
      default:
        break;
    }
    return option;
  }

  /**
   * get options calendar
   * @param {array} channelCalendar
   * @return {Promise<[]>}
   */
  getOptionCalendars = (channelCalendar) => {
    return Promise.all(channelCalendar.map(item => MicrosoftCalendar.query().findById(item.id_calendar.replace(/^MI_/, ""))))
  };

  /**
   * Add data to payload
   * @param {object} payload
   * @return {Promise<object>}
   */
  async mixDataPayload(payload) {
    const blockId = payload.actions[0].block_id.split('/');
    const values = payload.actions[0].selected_option.value.split('/');
    if (values[0] === "edit") {
      const event = await getEvent(blockId[0].split('MI_')[1], blockId[1]);
      const chanCals = await ChannelsCalendar.query().where({ id_channel: payload.channel.id });
      const calendars = await this.getOptionCalendars(chanCals);
      payload.calendars = calendars.filter(function (el) {
        return el != null;
      });
      payload.idCalendar = values[1];
      payload.eventEditDT = event.data;
      const user_id = payload.user.id;
      payload.userInfo = await this.getUserInfo(user_id);
    } else if (values[0] === "del") {
      payload.calendar = await MicrosoftCalendar.query().findById(values[1]);
    }
    return payload
  }

  /**
   *
   * @param {Object} req
   * @param {object} res
   */
  async handlerPayload(req, res) {
    try {
      let { payload } = req.body;
      payload = JSON.parse(payload);
      let option = null;
      switch (payload.type) {
        case "block_actions":
          res.status(200).send("Ok");
          if (payload.actions[0].action_id === 'overflow-action') {
            payload = await this.mixDataPayload(payload);
          }
          option = handlerBlocksActions(payload, this.template);
          break;
        case "view_submission":
          res.status(200).send({ "response_action": "clear" });
          option = await this.handlerSubmit(payload);
          break;
        case "view_closed":
          res.status(200).send({ "response_action": "clear" });
          break;
        default:
          res.status(200).send({ "response_action": "clear" });
          break;
      }
      if (option) await Axios(option);
    } catch (e) {
      console.log("⇒⇒⇒ Handler Payload ERROR: ", e);
      return res.status(403).send("Error !");
    }
  }

  async chatServiceHandler(req, res, next) {
    let {
      payload = null,
      challenge = null,
      event = null,
      command = null,
    } = req.body;
    try {
      const regex = new RegExp(`\/${Env.getOrFail("SLACK_CMD_CALENDAR")}`);
      if (event) {
        return this.handlerEvent(req, res);
      } else if (command && regex.test(command)) {
        return this.handlerCommand(req, res);
      } else if (payload) {
        return this.handlerPayload(req, res);
      } else if (challenge) {
        return res.status(200).send(challenge);
      }
      return res.status(200).send(`Ok`);
    } catch (e) {
      console.log("⇒⇒⇒ Chat Server Handler ERROR: ", e);
      return res.status(403).send("Error !");
    }
  }

  /**
   * sleep
   * @param {number} ms
   * @returns {Promise}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * handler Notifications
   * @param {object} value
   */
  async handlerNotifications(value) {
    try {
      const { subscriptionId, changeType, resource } = value;
      const idEvent = resource.split('/')[3];
      const idUser = resource.split('/')[1];
      if (changeType === "updated") {
        await this.sleep(1500);
      }
      const idCalendar = await this.getValueRedis(subscriptionId);
      let event = await getEvent(idUser, idEvent).catch((err) => {
        if (err.response.status === 404 && (changeType === "updated" || changeType === "deleted")) return null;
        throw err;
      });
      if (!event || !idCalendar) return null;
      event = event.data;
      const eventRedis = await this.getValueRedis(event.id);
      if (eventRedis) {
        const data = JSON.parse(eventRedis);
        const checked = _.isEqual(event, data);
        if (checked) {
          return null;
        }
      }
      await this.setValueRedis(event.id, JSON.stringify(event), 5);
      const arrChennelCalendar = await ChannelsCalendar.query().where({ id_calendar: `MI_${idCalendar}`, watch: true });
      if (arrChennelCalendar.length === 0) return null;
      const account = await MicrosoftAccount.query().findById(idUser);
      event.timezone = account.timezone;
      const calendar = await MicrosoftCalendar.query().findById(idCalendar);
      event.nameCalendar = calendar.name;
      const { showEvent } = this.template;
      let datas = null;
      switch (changeType) {
        case "updated":
          datas = handlerData("*Type: Updated event*", arrChennelCalendar, event, showEvent);
          break;
        case "created":
          datas = handlerData("*Type: Create event*", arrChennelCalendar, event, showEvent);
          break;
        case "deleted":
          datas = handlerData("*Type: Deleted event*", arrChennelCalendar, event, showEvent);
          break;
        default:
          break
      }

      const option = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Env.chatServiceGet("BOT_TOKEN")}`,
        },
        url:
          Env.chatServiceGet("API_URL") +
          Env.chatServiceGet("API_POST_MESSAGE"),
      };

      // Buoc 3: Promise all
      if (datas) await Promise.all(datas.map(data => {
        option.data = data;
        return Axios(option)
      }))
    } catch (e) {
      console.log("⇒⇒⇒ handlerNotifications ERROR: ", e);
    }
  }

  resourceServerHandler(req, res, next) {
    try {
      const { body = null, query = null } = req;
      if (body.value) {
        res.status(202).send("OK");
        const { idAccount } = JSON.parse(cryptoDecode(body.value[0].clientState));
        if (!idAccount) return;
        return this.handlerNotifications(body.value[0]);
      } else if (query) {
        const { validationToken } = query;
        return res.status(200).send(validationToken);
      }
      return res.status(400).send("BAD REQUEST");
    } catch (e) {
      console.log("⇒⇒⇒ Resource Server Handler ERROR: ", e);
      return res.status(403).send("ERROR");
    }
  }

  /**
   *
   * @param {array} listCalendar
   * @param {string} idAccount
   * @param {string} idChannel
   */
  async handlerCalendars(listCalendar, idAccount, idChannel) {
    for (let i = 0, length = listCalendar.length; i < length; i++) {
      const item = listCalendar[i];
      if (item.canEdit) {
        await saveCalendar({
          id: item.id,
          name: item.name,
          address_owner: item.owner.address
        }, idAccount, this.setValueRedis, this.instanceId, this.botId);
        await saveAccountCalendar({
          id_calendar: item.id,
          id_account: idAccount,
        });
        await saveChannelMicrosoftCalendar({
          id_calendar: item.id,
          id_channel: idChannel,
        });
        await saveChannelCalendar({
          id_calendar: `MI_${item.id}`,
          id_channel: idChannel,
          watch: true,
        });
      }
    }
  }

  async microsoftAccess(req, res, next) {
    let { code, state } = req.query;
    try {
      const payload = decodeJWT(state);
      const result = await this.getUidToken(payload.uid);
      if (!result) return res.status(401).send("jwt expired");
      const tokens = await getToken(code);
      await this.delUidToken(result);

      // Thuc hien lay tai nguyen user profile
      const profileUser = await getProfileUser(tokens.access_token);

      // Lưu accessToken vào redis
      await this.setAccessTokenRedis(profileUser.id, tokens.access_token);

      // Thêm đối tượng microsoftAccount và bảng microsoft_account
      await saveUserProfile(profileUser, tokens);

      // Thêm channel vào bảng channels
      await saveInfoChannel(payload.idChannel);

      // Thêm dữ liệu vào bảng ChannelMicrosoftAccount
      await saveChannelAccount(payload.idChannel, profileUser.id);

      // Thuc hien lay tai nguyen list calendars
      const allData = await getListCalendar(profileUser.id);
      await this.handlerCalendars(
        allData.value,
        profileUser.id,
        payload.idChannel
      );
      return res.send("Login Successful !");
    } catch (e) {
      console.log("⇒⇒⇒ Microsoft Access ERROR: ", e);
      return res.send("Login Error !");
    }
  }

  /**
   * custom customRepeat
   * @param {Object} view
   */
  _customRepeat(view) {
    view.blocks[9].element.options[0].value = "nomal";
    view.blocks[9].element.options[1].value = "daily";
    view.blocks[9].element.options[2].value = "weekly";
    view.blocks[9].element.options[3].value = "absoluteMonthly";
    view.blocks[9].element.initial_option.value = "nomal";
  }

}

module.exports = SlackMicrosoft;

(async function () {
  await Template().init(process.argv[2]);
  const pipeline = new SlackMicrosoft(process.argv[2], {
    config: {
      path: process.argv[3],
      appRoot: __dirname,
    },
  });
  await pipeline.init();
  pipeline.app.get("/auth/microsoft", pipeline.microsoftAccess);
  pipeline._customRepeat(pipeline.template.addEvent);
  pipeline._customRepeat(pipeline.template.editEvent);
  AxiosConfig(pipeline);
})();
