const Env = require('../../utils/Env');
const qs = require("qs");
const axios = require('axios');
const MicrosoftAccount = require('../../models/MicrosoftAccount');

/**
 *  Get refresh token in database
 * @param {string} idAccount
 * @returns {string} refresh token
 */
function getRefreshToken(idAccount) {
  return new Promise((resolve, reject) => {
    MicrosoftAccount.query().findById(idAccount)
      .then((data) => {
        if (!data) {
          return reject(null);
        } else {
          return resolve(data.refresh_token);
        }
      })
      .catch(reject)
  })
}

/**
 *  create new access token
 * @param {string} idAccount
 * @returns {string} access token
 */
const createAccessToken = async (idAccount) => {
  const refreshToken = await getRefreshToken(idAccount);
  const data = {
    "grant_type": "refresh_token",
    "refresh_token": refreshToken,
    "client_id": Env.resourceServerGet("AZURE_ID"),
    "client_secret": Env.resourceServerGet("AZURE_SECRET"),
    "scope": Env.resourceServerGet("SCOPE")
  }

  const options = {
    method: "POST",
    headers: {"content-type": "application/x-www-form-urlencoded"},
    data: qs.stringify(data),
    url:
      Env.resourceServerGet("API_URL_AUTH") +
      Env.resourceServerGet("API_TOKEN"),
  };

  const result = await axios(options);
  return result.data.access_token;
}
/**
 * Update refresh token
 * @param {string} idAccount
 * @param {string} refreshToken
 */
const updateRefresh = (idAccount, refreshToken) => {
  return MicrosoftAccount.query()
    .patch({refresh_token: refreshToken})
    .findById(idAccount);
}

module.exports = {
  createAccessToken,
  updateRefresh
}
