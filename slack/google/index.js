const BaseServer = require("../../common/BaseServer");
const Env = require("../../utils/Env");
const Redis = require("../../utils/redis");
const Template = require("../views/Template");
const Channel = require("../../models/Channel");
const GoogleAccount = require("../../models/GoogleAccount");
const GoogleCalendar = require("../../models/GoogleCalendar");
const AxiosConfig = require('./Axios');
const Axios = require('axios');
const { cryptoDecode, decodeJWT } = require('../../utils/Crypto');
const ChannelsCalendar = require("../../models/ChannelsCalendar");
const GoogleAccountCalendar = require("../../models/GoogleAccountCalendar");
const ChannelGoogleCalendar = require("../../models/ChannelGoogleCalendar");
const _ = require('lodash');
const Moment = require('moment');
const MomentTimezone = require('moment-timezone');

const {
  getToken,
  getListCalendar,
  getProfile,
  getInfoChannel,
  saveInfoChannel,
  watchGoogleCalendar,
  getTimeZoneGoogle,
  saveChannelAccount,
} = require("./Auth");

const {
  requestPostLogin,
  requestSettings,
  requestHome,
  configAddEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  handlerAction,
  getEventsTodays,
  convertBlocksEvents
} = require("./ChatService");
const {
  getEventUpdate,
  makeData,
  getEvent,
} = require("./ResourceServer");

class SlackGoogle extends BaseServer {
  constructor(instanceId, opt) {
    super(instanceId, opt);
    this.authGoogle = this.authGoogle.bind(this);
    this.template = Template();
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
          option = requestPostLogin(event, this.template, this.setUidToken);
          break;
        case types.CHANNEL_JOIN:
          if (authorizations[0].user_id === event.user) {
            option = requestPostLogin(event, this.template, this.setUidToken);
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
   * Lấy danh sách calendar
   * @param {string} channelId
   * @return {Promise<[]>}
   */
  async getCalendarsInChannel(channelId) {
    const channelCalendar = await ChannelsCalendar.query().where({ id_channel: channelId });
    const calendars = [];
    const regex = /^GO_/;
    for (let i = 0, length = channelCalendar.length; i < length; i++) {
      if (regex.test(channelCalendar[i].id_calendar)) {
        let idCalendar = channelCalendar[i].id_calendar.replace(regex, "");
        const calendar = await GoogleCalendar.query().findById(idCalendar);
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
 *
 * @param {Array} data
 * @param {Array} calendars
 * @param {object} account
 * @returns {Array}
 */
  convertEventsData = (events, account, calendar) => {
    const data = [];
    const values = events.data.items;
    if (values.length > 0) {
      values.forEach(item => {
        const event = _.pick(item, ['id', 'summary', 'start', 'end', 'location']);
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
        $relation: 'channel_google_account',
        $modify: ["whereAccount"],
        calendar: {
          $relation: 'google_calendar',
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
      if (a.start.dateTime) {
        return (new Date(a.start.dateTime)) - (new Date(b.start.dateTime));
      }
      return (new Date(`${a.start.date}T00:00:00Z`)) - (new Date(`${b.start.date}T00:00:00Z`));
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
      for (let i = 0; i < data.account.length; i++) {
        const account = data.account[i];
        if (account.calendar.length === 0) continue;
        for (let j = 0; j < account.calendar.length; j++) {
          const calendar = account.calendar[j];
          let eventRedis = await this.getValueRedis(`EVENT-TODAY_${calendar.id}`);
          if (eventRedis) {
            eventRedis = JSON.parse(eventRedis);
            if (eventRedis.length <= 0) continue;
            events = this.sortAndSetData(events, eventRedis, calendar.id, exp);
            continue;
          }
          eventRedis = await getEventsTodays(account, j, start, end);
          if (eventRedis.data.items.length === 0) continue;
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
      const { text } = req.body;
      let option = null;
      const type = text.trim();

      switch (type) {
        case "home":
          option = requestHome(req.body, this.template.homePage);
          break;
        case "settings":
          option = requestSettings(req.body, this.template.systemSetting, this.setUidToken);
          break;
        case "go add-event":
          option = await this.handlerAddEvent(req.body);
          break;
        case "go event-today":
          option = await this.handlerEventsToday(req.body);
          break;
        default:
          option = null;
          break
      }
      if (option) await Axios(option)
        .then(({ data }) => {
          if (!data.ok) throw data
        });
    } catch (e) {
      console.log("⇒⇒⇒ Handler Command ERROR: ", e);
      res.status(204).send("Error");
    }
  }

  /**
   * Xử lý submit open view
   * @param payload
   * @return {Promise<{object|null}>}
   */
  async handlerSubmit(payload) {
    const { callback_id } = payload.view;
    const { values } = payload.view.state;

    if (callback_id === "GO_add-event") {
      const idCalendar = values["GO_select_calendar"]["select_calendar"]["selected_option"].value;
      const { id_account } = await GoogleAccountCalendar.query().findOne({ id_calendar: idCalendar });
      const account = await GoogleAccount.query().findOne({ id: id_account });
      let option = { method: "POST" };
      option.url = `${Env.resourceServerGOF("API_URL")}${Env.resourceServerGOF("API_CALENDAR")}/${idCalendar}/events`;
      option.headers = { 'content-type': 'application/json', 'X-Google-AccountId': id_account };
      option.data = createEvent(values, account);
      return option;
    } else if (callback_id === "GO_edit-event") {
      const parseData = JSON.parse(payload.view.private_metadata);
      const idEvent = parseData.idEvent;
      const idCalendar = values["GO_select_calendar"]["select_calendar"]["selected_option"].value;
      const { id_account } = await GoogleAccountCalendar.query().findOne({ id_calendar: idCalendar });
      const account = await GoogleAccount.query().findOne({ id: id_account });
      let option = { method: "PUT" };
      option.url = `${Env.resourceServerGOF("API_URL")}${Env.resourceServerGOF("API_CALENDAR")}/${idCalendar}/events/${idEvent}`;
      option.headers = { 'content-type': 'application/json', 'X-Google-AccountId': id_account };
      option.data = updateEvent(values, account);
      return option;
    } else if (callback_id === "GO_delete-event") {
      const blockId = payload.view.blocks[0].block_id.split('/');

      const idEvent = blockId[1];
      const event = payload.view.blocks[1].block_id.split('/');
      const goAccount = event[0].split('GO_');
      const idAccount = goAccount[1];
      const idCalendar = event[1];
      return deleteEvent(idAccount, idCalendar, idEvent)
    }

  }


  /**
   * Add data to payload
   * @param {object} payload
   * @return {Promise<object>}
   */
  async mixDataPayload(payload) {
    const idEvent = payload.actions[0]["selected_option"].value.split('/')[1];
    const idCalendar = payload.actions[0].block_id.split('/')[1];
    const calendar = await GoogleCalendar.query().findById(idCalendar);
    payload.calendarName = calendar.name;
    const value = payload.actions[0].selected_option.value.split('/');
    if (value[0] === "edit") {
      const idAccount = payload.actions[0].block_id
        .split('/')[0]
        .split('GO_')[1];
      const account = await GoogleAccount.query().findById(idAccount);
      payload.timeZoneGG = account.timezone;
      const user_id = payload.user.id;
      const channel_id = payload.container.channel_id;
      payload.userInfo = await this.getUserInfo(user_id);
      payload.calendars = await this.getCalendarsInChannel(channel_id);
      const options = {
        method: 'GET',
        headers: { 'X-Google-AccountId': idAccount },
        url: `${Env.resourceServerGOF("API_URL")}${Env.resourceServerGOF("API_CALENDAR")}/${idCalendar}/events/${idEvent}`
      };
      const result = await Axios(options);
      payload.event = result.data
    }
    return payload
  }

  /**
   *
   * @param {object} req
   * @param {object} res
   * @returns {Promise}
   */
  async handlerPayLoad(req, res) {
    try {
      let { payload } = req.body;
      payload = JSON.parse(payload);
      let option = null;
      switch (payload.type) {
        case "block_actions":
          if (payload.actions[0].action_id === "overflow-action") {
            payload = await this.mixDataPayload(payload)
          }
          option = handlerAction(payload, this.template);
          res.status(200).send("OK");
          break;
        case "view_submission":
          res.status(200).send({ "response_action": "clear" });
          option = await this.handlerSubmit(payload);
          break;
        default:
          res.status(200).send({ "response_action": "clear" });
          option = null
      }
      if (option) await Axios(option)
    } catch (e) {
      console.log("⇒⇒⇒ Handler PayLoad ERROR: ", e);
      return res.status(204).send("Error");
    }
  }

  async chatServiceHandler(req, res, next) {
    const { challenge, event, command, payload } = req.body;
    try {
      if (challenge) return res.status(200).send(challenge);
      if (event) return this.handlerEvent(req, res);
      const regex = new RegExp(`\/${Env.getOrFail("SLACK_CMD_CALENDAR")}`);
      if (command && regex.test(command)) return this.handlerCommand(req, res);
      if (payload) return this.handlerPayLoad(req, res);
      return res.status(200).send("OK");
    } catch (e) {
      console.log("⇒⇒⇒ Chat Server Handler ERROR: ", e);
      return res.status(204).send("Error");
    }
  }

  /**
   *
   * @param {object} calendar
   * @param {string} idAccount
   * @return {Promise<object|boolean>}
   */
  async handlerCalendars(calendar, idAccount) {
    const findCalendar = await GoogleCalendar.query()
      .findOne({ id: calendar.id });
    if (!findCalendar) await GoogleCalendar.query()
      .insert({ id: calendar.id, name: calendar.summary });

    const googleAC = {
      id_calendar: calendar.id,
      id_account: idAccount,
    };
    const findGAC = await GoogleAccountCalendar.query().findOne(googleAC);
    if (!findGAC) {
      await GoogleAccountCalendar.query().insert(googleAC);
      await watchGoogleCalendar(googleAC);
    }
  }

  /**
   *
   * @param {object} profile
   * @param {object} tokens
   * @return {Promise<void>}
   */
  async handlerUser(profile, tokens) {
    const result = await getTimeZoneGoogle(profile.sub);
    const timeZone = result.data.value;
    await GoogleAccount.query().insert({
      id: profile.sub,
      name: profile.name,
      mail: profile.email,
      refresh_token: tokens.refresh_token,
      timezone: timeZone,
    });
  }

  async saveChannelsCalendar(item) {
    const result = await ChannelsCalendar.query().findOne(item);
    if (!result) {
      item.watch = true;
      await ChannelsCalendar.query().insert(item)
    }
  }

  async saveChannelGoogleCalendar(item) {
    const result = await ChannelGoogleCalendar.query().findOne(item);
    if (!result) {
      item.watch = true;
      await ChannelGoogleCalendar.query().insert(item)
    }
  }

  async authGoogle(req, res) {
    let { code, state } = req.query;
    const cookie = req.cookies[this.instanceId];
    if (cookie) state = cookie;

    try {
      const payload = decodeJWT(state);
      const result = await this.getUidToken(payload.uid);
      if (!result) return res.status(401).send("jwt expired");
      const tokens = await getToken(code);
      await this.delUidToken(result);

      // Xử lý profile user google
      const profile = await getProfile(tokens.access_token);
      const user = await GoogleAccount.query().findById(profile.sub);

      if (!user) {
        await this.setAccessTokenRedis(profile.sub, tokens.access_token);
        await this.handlerUser(profile, tokens);
      }

      // Xử lý channel slack
      let channel = await Channel.query().findById(payload.idChannel);
      if (!channel) {
        channel = await getInfoChannel(payload.idChannel);
        await saveInfoChannel(channel)
      }

      // Thêm dữ liệu vào bảng ChannelMicrosoftAccount
      await saveChannelAccount(payload.idChannel, profile.sub);

      // Xử lý danh sách calendar
      const { items } = await getListCalendar(profile.sub, tokens.access_token);
      const regex = /writer|owner/;
      for (let i = 0, length = items.length; i < length; i++) {
        if (regex.test(items[i].accessRole)) {
          await this.handlerCalendars(items[i], profile.sub);
          await this.saveChannelsCalendar({
            id_calendar: `GO_${items[i].id}`,
            id_channel: payload.idChannel,
          });
          await this.saveChannelGoogleCalendar({
            id_calendar: items[i].id,
            id_channel: payload.idChannel
          });
        }
      }
      return res.send("Login Successful !");
    } catch (e) {
      console.log("⇒⇒⇒ Auth Google ERROR: ", e);
      return res.status(400).send("ERROR");
    }
  }

  async resourceServerHandler(req, res, next) {
    try {
      const decode = await cryptoDecode(req.headers['x-goog-channel-token']);
      const { idAccount, idCalendar } = JSON.parse(decode);

      let event = await getEventUpdate(req.headers, idAccount);
      if (!event) return res.status(204).send("OK");
      const eventRedis = await this.getValueRedis(event.id);
      if (eventRedis) {
        const data = JSON.parse(eventRedis);
        const checked = _.isEqual(event, data);
        if (checked) {
          return res.status(204).send("OK");
        }
      }
      this.setValueRedis(event.id, JSON.stringify(event), 5);
      if (event && event.status === 'cancelled') {
        event = await getEvent(idCalendar, event.id, idAccount);
        if (!event.summary) return res.status(204).send("OK");
      }
      const account = await GoogleAccount.query().findById(idAccount);
      event.timezone = account.timezone;
      const channelCalendar = await ChannelsCalendar.query().where({ id_calendar: `GO_${idCalendar}`, watch: true });
      const data = makeData(channelCalendar, this.template.showEvent.blocks, event);

      const tokenBot = Env.chatServiceGet("BOT_TOKEN");
      const option = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenBot}`,
        },
        url:
          Env.chatServiceGet("API_URL") +
          Env.chatServiceGet("API_POST_MESSAGE"),
      };
      if (data.length > 0) await Promise.all(data.map(value => {
        option.data = value;
        return Axios(option)
      }));
      return res.status(204).send("OK");
    } catch (e) {
      console.log("⇒⇒⇒ Resource Server Handler ERROR: ", e);
      return res.status(204).send("ERROR");
    }
  }
  convertView() {
    this.template.listEvent.blocks[0].elements[1].text = "*CALENDAR GOOGLE*";
  }
}

module.exports = SlackGoogle;
(async function () {
  await Template().init(process.argv[2]);
  const pipeline = new SlackGoogle(process.argv[2], {
    config: {
      path: process.argv[3],
      appRoot: __dirname,
    },
  });
  await pipeline.init();
  pipeline.app.get("/auth/google", pipeline.authGoogle);
  pipeline.convertView();
  AxiosConfig(pipeline);
})();
