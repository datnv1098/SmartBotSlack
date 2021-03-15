const qs = require("qs");
const axios = require("axios");
const Env = require("../../utils/Env");
const MicrosoftAccount = require("../../models/MicrosoftAccount");
const MicrosoftCalendar = require("../../models/MicrosoftCalendar");
const MicrosoftAccountCalendar = require("../../models/MicrosoftAccountCalendar");
const Channel = require("../../models/Channel");
const ChannelsCalendar = require("../../models/ChannelsCalendar");
const ChannelMicrosoftAccount = require("../../models/ChannelMicrosoftAccount");
const ChannelMicrosoftCalendar = require("../../models/ChannelMicrosoftCalendar");
const {createSubscription} = require('./Subscription');

/**
 * Lay tai nguyen tokens
 * @param {string} code
 * @returns {Promise}
 */
const getToken = (code) => {
  return new Promise((resolve, reject) => {
    let data = {
      client_id: Env.resourceServerGOF("AZURE_ID"),
      scope: Env.resourceServerGOF("SCOPE"),
      code,
      redirect_uri: Env.resourceServerGOF("AZURE_REDIRECT"),
      grant_type: "authorization_code",
      client_secret: Env.resourceServerGOF("AZURE_SECRET"),
      response_mode: "form_post",
    };
    const options = {
      method: "POST",
      headers: {"content-type": "application/x-www-form-urlencoded"},
      data: qs.stringify(data),
      url:
        Env.resourceServerGOF("API_URL_AUTH") +
        Env.resourceServerGOF("API_TOKEN"),
    };
    axios(options)
      .then((res) => resolve(res.data))
      .catch(reject);
  });
};

/**
 * Lay tai nguyen  danh sach calendar
 * @param {string} idAccount
 * @returns {Promise}
 */
const getListCalendar = (idAccount) => {
  const options = {
    method: "GET",
    headers: {'X-Microsoft-AccountId': idAccount},
    url:
      Env.resourceServerGOF("GRAPH_URL") +
      Env.resourceServerGOF("GRAPH_CALENDARS"),
  };
  return new Promise((resolve, reject) => {
    axios(options)
      .then((res) => resolve(res.data))
      .catch(reject);
  });
};

/**
 * Lay tai nguyen thong tin timeZOne
 * @param {string} accessTokenAzure
 * @returns {Promise}
 */
const getTimeZoneOutlook = (accessTokenAzure) => {
  const options = {
    method: "GET",
    headers: {Authorization: `Bearer ${accessTokenAzure}`},
    url:
      Env.resourceServerGOF("GRAPH_URL") + Env.resourceServerGOF("GRAPH_MAILBOX_SETTINGS"),
  };
  return axios(options);
};

/**
 * Lay suppport timezone
 * @param {string} accessTokenAzure
 * @returns {Promise}
 */
const getTimeZoneSupport = (accessTokenAzure) => {
  const options = {
    method: "GET",
    headers: {Authorization: `Bearer ${accessTokenAzure}`},
    url: Env.resourceServerGOF("GRAPH_URL") + Env.resourceServerGOF("GRAPH_TIMEZONE_SUPPORT"),
  };
  return axios(options);
};


/**
 * Lay tai nguyen thong tin ve user Profile
 * @param {string} accessTokenAzure
 * @returns {Promise}
 */
const getProfileUser = (accessTokenAzure) => {
  return new Promise((resolve, reject) => {
    const options = {
      method: "GET",
      headers: {Authorization: `Bearer ${accessTokenAzure}`},
      url:
        Env.resourceServerGOF("GRAPH_URL") +
        Env.resourceServerGOF("GRAPH_USER"),
    };
    axios(options)
      .then((res) => resolve(res.data))
      .catch(reject);
  });
};

/**
 * Luu thong tin vao database
 * @param {object} profile
 * @param {object} tokens
 * @returns {Promise}
 */
const saveUserProfile = async (profile, tokens) => {
  const result = await getTimeZoneOutlook(tokens.access_token);
  const resultArr = await getTimeZoneSupport(tokens.access_token);
  const timeZone = resultArr.data.value.find((element) => element.alias === result.data.timeZone);
  const account = {
    id: profile.id,
    name: profile.displayName,
    mail: profile.mail ? profile.mail : profile.userPrincipalName,
    refresh_token: tokens.refresh_token,
    timezone: timeZone.displayName.split('UTC')[1].split(')')[0],
    created_at: null,
    updated_at: null,
  };
  const data = await MicrosoftAccount.query().findById(account.id);
  if (!data) await MicrosoftAccount.query().insert(account)
};

/**
 *  Luu array calendar vao database
 * @param {object} calendar
 * @param {string} idAccount
 * @param {function} setValueRedis
 * @returns {void}
 */
const saveCalendar = async (calendar, idAccount, setValueRedis) => {
  const data = await MicrosoftCalendar.query().findOne({
    id: calendar.id,
    address_owner: calendar.address_owner,
  });
  if (!data) {
    await MicrosoftCalendar.query().insert(calendar);
    const resultSub = await createSubscription(calendar.id, idAccount);
    await setValueRedis(resultSub.data.id, calendar.id, 60 * 60 * 24);
  }
};

/**
 * Lay ra thong tin ve channel thong qua id channel
 * @param {string} idChannel
 * @returns {Promise}
 */
const getNameChannel = (idChannel) => {
  let url = Env.chatServiceGOF('API_URL');
  url += Env.chatServiceGOF('API_CHANNEL_INFO');
  url += idChannel;
  const options = {
    method: "POST",
    headers: {Authorization: `Bearer ${Env.chatServiceGOF("BOT_TOKEN")}`},
    data: {
      channel: idChannel,
    },
    url,
  };
  return axios(options);
};

/**
 * Luu thong tin channel vao database
 * @param {string} idChannel
 * @param {string} idAccount
 * @returns {Promise}
 */
const saveChannelAccount = async (idChannel, idAccount) => {
  const result = await ChannelMicrosoftAccount.query()
    .where("id_channel", idChannel)
    .where("id_account", idAccount);
  if (result.length === 0) {
    return ChannelMicrosoftAccount.query().insert({
      id_channel: idChannel,
      id_account: idAccount,
    });
  }
};

/**
 * Luu thong tin channel vao database
 * @param {string} idChannel
 * @returns {Promise}
 */
const saveInfoChannel = async (idChannel) => {
  const promise = new Promise((resolve) => resolve());
  const dataChannel = await getNameChannel(idChannel);
  if (!dataChannel) return promise;
  const result = await Channel.query().findById(idChannel);
  if (result) return promise;
  const channel = {
    id: idChannel,
    name: dataChannel.data.channel.name,
    created_at: null,
  };
  return Channel.query().insert(channel);
};

/**
 * Luu thong tin MicrosoftAccountCalendar vao database
 * @param {object} accountCalendar
 * @returns {void}
 */
const saveAccountCalendar = async (accountCalendar) => {
  const data = await MicrosoftAccountCalendar.query().findOne(accountCalendar);
  if (!data) await MicrosoftAccountCalendar.query().insert(accountCalendar);
};

/**
 * Luu thong tin saveChannelsCalendar vao database
 * @param {object} item
 * @returns {void}
 */
const saveChannelCalendar = async (item) => {
  const data = await ChannelsCalendar.query().findOne({
    id_channel: item.id_channel,
    id_calendar: item.id_calendar,
  });
  if (!data) await ChannelsCalendar.query().insert(item);
};


/**
 * Luu thong tin saveChannelsCalendar vao database
 * @param {object} item
 * @returns {void}
 */
const saveChannelMicrosoftCalendar = async (item) => {
  const data = await ChannelMicrosoftCalendar.query().findOne(item);
  if (!data) {
    item.watch = true;
    await ChannelMicrosoftCalendar.query().insert(item);
  }
};


module.exports = {
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
};
