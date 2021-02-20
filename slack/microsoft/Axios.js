const Axios = require('axios');
const Env = require('../../utils/Env');
const { createAccessToken } = require('./RefreshToken');
const Redis = require('../../utils/redis/index');

/**
 *
 * @param {string} key
 * @returns {*} Values
 */
function getValueRedis(key) {
  return new Promise((resolve, reject) => {
    Redis.client.get(key, (err, reply) => {
      if (err) reject(null);
      resolve(reply);
    });
  })
}

module.exports = function () {
  // Handler REQUEST
  Axios.interceptors.request.use(async function (config) {
    console.log('Start time: ', new Date().toISOString());
    console.log('Before REQUEST: ', config);
    const { url = null, headers = null } = config;
    const {Authorization = null} = config.headers;
    console.log("Authorization:",Authorization);
    if (url && url.split('.com')[0] === Env.resourceServerGet("GRAPH_URL").split('.com')[0]&&!Authorization) {
      const idAccount = headers['X-Microsoft-AccountId'];
      console.log("idAccount", idAccount);
      try {
        let accessToken = await getValueRedis(idAccount);
        console.log("accessToken", accessToken);
        if (accessToken) {
          config.headers['Authorization'] = `Bearer ${accessToken}`;
          return config;
        }
        accessToken = await createAccessToken(idAccount);
        Redis.client.setex(idAccount, 60 * 59, accessToken);
        config.headers['Authorization'] = `Bearer ${accessToken}`;
      } catch (error) {
        return Promise.reject(error);
      }
    }
    return config;
  }, function (error) {
    return Promise.reject(error);
  });

  //  Handler RESPONSE
  Axios.interceptors.response.use(function (response) {
    console.log('RESPONSE TIME: ', new Date().toISOString());
    // console.log('Response:',response);
    return response;
  }, async function (error) {
    console.log("ERROR RESPONSE CONFIG: ", error);
    console.log("ERROR RESPONSE DATA: ", error.response.data);
    try {
      if (error.response.data.error.code === "InvalidAuthenticationToken") {
        const idAccount = error.config.headers['X-Microsoft-AccountId'];
        const accessToken = await createAccessToken(idAccount);
        Redis.client.setex(idAccount, 60 * 59, accessToken);
        error.config.headers['Authorization'] = `Bearer ${accessToken}`;
        return Axios(error.config);
      }

    } catch (err) {
      return Promise.reject(err);
    }
    return Promise.reject(error);
  });
}
