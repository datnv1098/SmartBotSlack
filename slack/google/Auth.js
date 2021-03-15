const Axios = require("axios");
const qs = require("qs");
const Env = require("../../utils/Env");
const Channel = require("../../models/Channel");
const ChannelGoogleAccount = require("../../models/ChannelGoogleAccount");
const {cryptoEncode} = require('../../utils/Crypto');
const {v4: uuidV4} = require("uuid");

/**
 * Thực hiện việc lấy accesToken
 * @param {string} code
 * @returns {Promise}
 */
const getToken = (code) => {
  return new Promise((resolve, reject) => {
    let url = Env.resourceServerGet("API_URL_OAUTH");
    url += `${Env.resourceServerGet("API_TOKEN")}`;
    let data = {
      client_id: Env.resourceServerGet("CLIENT_ID"),
      client_secret: Env.resourceServerGet("CLIENT_SECRET"),
      code,
      grant_type: Env.resourceServerGet("GRANT_TYPE"),
      redirect_uri: Env.resourceServerGet("REDIRECT_URI"),
    };
    const options = {
      method: "POST",
      headers: {"content-type": "application/x-www-form-urlencoded"},
      data: qs.stringify(data),
      url,
    };
    Axios(options)
      .then((res) => resolve(res.data))
      .catch((err) => reject(err));
  });
};
/**
 *
 * @param {object}
 * @returns {Promise}
 */

const watchGoogleCalendar = async ({id_calendar, id_account}) => {
  const iat = Date.now();
  const obj = {idCalendar: id_calendar, idAccount: id_account, iat};
  const idSub = uuidV4();
  const tokens = cryptoEncode(JSON.stringify(obj));
  const options = {
    method: 'POST',
    url: `${Env.resourceServerGOF("API_URL")}/calendar/v3/calendars/${id_calendar}/events/watch`,
    headers: {'X-Google-AccountId': id_account},
    data: {
      id: idSub,
      type: Env.resourceServerGOF("TYPE"),
      address: Env.resourceServerGOF("ADDRESS"),
      "token": tokens,
    }
  };
  return Axios(options);
};

/**
 * Thông qua accessToken để list ra calendar
 * @param{string} idAccount
 * @param{string} accessToken
 * @returns {Promise}
 */
const getListCalendar = (idAccount, accessToken) => {
  const options = {
    method: "GET",
    headers: {Authorization: `Bearer ${accessToken}`},
    url:
      Env.resourceServerGOF("API_URL") +
      Env.resourceServerGOF("API_lIST_CALENDAR"),
  };
  return new Promise((resolve, reject) => {
    Axios(options)
      .then((res) => resolve(res.data))
      .catch((error) => reject(error));
  });
};

/**
 * accessToken để lấy ra info
 * @param {string} accessToken
 * @returns {Promise}
 */
const getProfile = (accessToken) => {
  let url = Env.resourceServerGet("API_URL");
  url += `${Env.resourceServerGet("API_USER_INFO")}`;
  return new Promise((resolve, reject) => {
    const options = {
      method: "GET",
      headers: {Authorization: `Bearer ${accessToken}`},
      url: url,
    };
    Axios(options)
      .then((res) => resolve(res.data))
      .catch((err) => reject(err));
  });
};

/**
 *
 * @param idChannel
 * @return {Promise<unknown>}
 */
const getInfoChannel = (idChannel) => {
  return new Promise((resolve, reject) => {
    let url = Env.chatServiceGOF("API_URL");
    url += Env.chatServiceGOF("API_CHANNEL_INFO");
    url += idChannel;
    const options = {
      method: "GET",
      headers: {Authorization: `Bearer ${Env.chatServiceGOF("BOT_TOKEN")}`},
      data: qs.stringify({channel: idChannel}),
      url,
    };
    Axios(options)
      .then((res) => resolve(res.data.channel))
      .catch((err) => reject(err));
  });
};
/**
 *
 * @param {string} idAccount
 * @returns {Promise}
 */
const getTimeZoneGoogle = (idAccount) => {
  const options = {
    method: "GET",
    headers: {'X-Google-AccountId': idAccount},
    url:
      Env.resourceServerGOF("API_URL") + Env.resourceServerGOF("API_TIME_ZONE"),
  };
  return Axios(options);
};

/**
 * Luu thong tin channel vao database
 * @param {object} channel
 * @returns {Promise}
 */
const saveInfoChannel = (channel) => {
  return Channel.query().insert({
    id: channel.id,
    name: channel.name,
  });
};

/**
 * Luu thong tin channel vao database
 * @param {string} idChannel
 * @param {string} idAccount
 * @returns {Promise}
 */
const saveChannelAccount = async (idChannel, idAccount) => {
  const result = await ChannelGoogleAccount.query()
    .where("id_channel", idChannel)
    .where("id_account", idAccount);
  if (result.length === 0) {
    return ChannelGoogleAccount.query().insert({
      id_channel: idChannel,
      id_account: idAccount,
    });
  }
};

module.exports = {
  getToken,
  getListCalendar,
  getProfile,
  getInfoChannel,
  saveInfoChannel,
  watchGoogleCalendar,
  getTimeZoneGoogle,
  saveChannelAccount
};
