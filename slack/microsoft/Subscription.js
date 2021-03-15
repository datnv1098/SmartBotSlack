const Env = require('../../utils/Env');
const {cryptoEncode} = require('../../utils/Crypto');
const axios = require('axios');
/**
 * Sum date
 * @param {interger} days
 * @returns {Promise}
 */
Date.prototype.addDays = function (days) {
  var date = new Date(this.valueOf());
  date.setDate(date.getDate() + days);
  return date;
}

/**
 * register Subscription
 * @param {string} idCalendar
 * @param {string} idAccount
 * @returns {Promise}
 */
const createSubscription = (idCalendar, idAccount) => {
  const obj = {
    idAccount,
    iat: Math.floor(new Date() / 1000)
  }
  const state = cryptoEncode(JSON.stringify(obj));
  let date = new Date();
  const data = {
    "changeType": Env.resourceServerGOF("SUB_CHANGE_TYPE"),
    "notificationUrl": Env.resourceServerGOF("SUB_NOTIFICATION_URL"),
    "resource": `me/calendars/${idCalendar}/events`,
    "expirationDateTime": date.addDays(2),
    "latestSupportedTlsVersion": "v1_2",
    "clientState": state,
  }
  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      'X-Microsoft-AccountId': idAccount
    },
    data: JSON.stringify(data),
    url:
      Env.resourceServerGOF("GRAPH_URL") +
      Env.resourceServerGOF("GRAPH_SUB"),
  };
  return axios(options);
}
/**
 * update Subcription
 * @param {string} idSub
 * @param {string} idAccount
 * @returns {Promise}
 */
const updateSubscription = (idSub, idAccount) => {
  let date = new Date();
  const data = {
    "expirationDateTime": date.addDays(2)
  }
  const options = {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      'X-Microsoft-AccountId': idAccount
    },
    data: JSON.stringify(data),
    url:
      Env.resourceServerGOF("GRAPH_URL") +
      Env.resourceServerGOF("GRAPH_SUB") +
      idSub,
  };
  return axios(options);
}

module.exports = {
  createSubscription,
  updateSubscription,
}
