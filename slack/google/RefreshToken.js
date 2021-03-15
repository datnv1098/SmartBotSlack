const Axios = require("axios");
const GoogleAccount = require('../../models/GoogleAccount');
const Env = require('../../utils/Env');
const qs = require("qs");

const getRefreshToken = async (id) => {
  return new Promise((resolve, reject) => {
    GoogleAccount.query()
      .findById(id)
      .then((data) => {
        if (!data) {
          return null
        } else {
          return resolve(data.refresh_token);
        }
      })
      .catch((err) => {
        return reject(err);
      });
  });
}

const newAccessToken = async (idAccount) => {
  const refreshTokenGoogle = await getRefreshToken(idAccount);
  let url = Env.resourceServerGet("API_URL_OAUTH");
  url += `${Env.resourceServerGet("API_TOKEN")}`;

  let data = {
    grant_type: 'refresh_token',
    client_id: Env.resourceServerGet("CLIENT_ID"),
    client_secret: Env.resourceServerGet("CLIENT_SECRET"),
    refresh_token: refreshTokenGoogle
  }
  const options = {
    method: "POST",
    headers: {"content-type": "application/x-www-form-urlencoded"},
    data: qs.stringify(data),
    url: url,
  };
  const result = await Axios(options);
  return result.data.access_token;
}
const updateRefresh = (idAccount, refreshToken) => {
  return GoogleAccount.query()
    .patch({refresh_token: refreshToken})
    .findById(idAccount);
}
module.exports = {
  newAccessToken,
  updateRefresh
}
