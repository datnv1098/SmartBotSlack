require('dotenv').config();
const Express = require('express');
const knex = require("knex");
const {Model} = require('objection');
const Path = require('path');
const FsExtra = require('fs-extra');
const Fs = require('fs');
const BodyParser = require('body-parser');
const CookieParser = require('cookie-parser');
const _ = require("lodash");
const Env = require('../utils/Env');
const Redis = require('../utils/redis');
const Mongo = require('../utils/mongo');
const LogModel = require('../models/mongo/LogModel');

class BaseServer {
  /**
   * constructor BaseServer class
   * @param {string} instanceId
   * @param {object} opt
   */
  constructor(instanceId, opt) {
    const args = instanceId.split("-");
    this.botId = opt.config.path.split("/")[2];

    this.app = Express();
    this.instanceId = instanceId;
    this.chatService = args[0];
    this.resourceServer = args[1];

    this.config = typeof opt.config === "object" ? opt.config : {};

    this.chatServiceHandler = this.chatServiceHandler.bind(this);
    this.resourceServerHandler = this.resourceServerHandler.bind(this);
    this.pushMessageHandler = this.pushMessageHandler.bind(this);
    this.setUidToken = this.setUidToken.bind(this);
    this.getUidToken = this.getUidToken.bind(this);
    this.delUidToken = this.delUidToken.bind(this);
    this.getAccessTokenRedis = this.getAccessTokenRedis.bind(this);
    this.setAccessTokenRedis = this.setAccessTokenRedis.bind(this);
    this.getValueRedis = this.getValueRedis.bind(this);
    this.setValueRedis = this.setValueRedis.bind(this);

    this.requestHandler = {
      watchChatService: this.chatServiceHandler,
      watchResourceServer: this.resourceServerHandler,
      pushMessage: this.pushMessageHandler,
    }
  }

  /**
   * Set uid token in redis
   * @param uid
   * @return {Promise}
   */
  setUidToken(uid) {
    return new Promise((resolve, reject) => {
      const makeKey = `${this.botId}_UID_TOKEN_${uid}`;
      Redis.client.setex(makeKey, 60 * 30, uid, function (err, res) {
        if (err) reject(err);
        resolve(1);
      });
    })
  }

  /**
   * Get uid token in redis
   * @param uid
   * @return {Promise}
   */
  getUidToken(uid) {
    return new Promise((resolve, reject) => {
      const makeKey = `${this.botId}_UID_TOKEN_${uid}`;
      Redis.client.get(makeKey, (err, res) => {
        if (err) reject(err);
        resolve(res);
      });
    })
  }

  /**
   * Delete uid token in redis
   * @param uid
   * @return {Promise}
   */
  delUidToken(uid) {
    return new Promise((resolve, reject) => {
      const makeKey = `${this.botId}_UID_TOKEN_${uid}`;
      Redis.client.del(makeKey, (err, res) => {
        if (err) reject(err);
        resolve(res);
      });
    })
  }

  /**
   *
   * @param {string} key
   * @returns {*} Values
   */
  getAccessTokenRedis(key) {
    return new Promise((resolve, reject) => {
      let makeKey = `${this.botId}_${this.instanceId}_ACCESS_TOKEN_${key}`;
      Redis.client.get(makeKey, (err, reply) => {
        if (err) reject(err);
        resolve(reply);
      });
    })
  }

  /**
   *
   * @param {string} key
   * @param {string} value
   * @param {number} seconds
   * @returns {*} Values
   */
  setAccessTokenRedis(key, value, seconds = (60 * 59)) {
    return new Promise((resolve, reject) => {
      let makeKey = `${this.botId}_${this.instanceId}_ACCESS_TOKEN_${key}`;
      Redis.client.setex(makeKey, seconds, value, (err, reply) => {
        if (err) reject(err);
        resolve(reply);
      });
    })
  }

  /**
   *
   * @param {string} key
   * @returns {*} Values
   */
  getValueRedis(key) {
    return new Promise((resolve, reject) => {
      let makeKey = `${this.botId}_${this.instanceId}_${key}`;
      Redis.client.get(makeKey, (err, reply) => {
        if (err) reject(err);
        resolve(reply);
      });
    })
  }

  /**
   *
   * @param {string} key
   * @param {string} value
   * @param {number} seconds
   * @returns {*} Values
   */
  setValueRedis(key, value, seconds = (60 * 60 * 24)) {
    return new Promise((resolve, reject) => {
      let makeKey = `${this.botId}_${this.instanceId}_${key}`;
      Redis.client.setex(makeKey, seconds, value, (err, reply) => {
        if (err) reject(err);
        resolve(reply);
      });
    })
  }

  /**
   * Read config file from config folder(either depending on the service you want to run)
   * @param fileName
   * @returns {Promise<unknown>}
   */
  getConfig(fileName) {
    return new Promise((resolve, reject) => {
      FsExtra.readJson(Path.join(this.config.path, fileName), (err, text) => {
        if (err) {
          reject(err);
        } else {
          resolve(text);
        }
      });
    });
  }

  /**
   * Load config from file in config folder(either depending on the service you want to run)
   * @param {string} name
   * @return {Promise<unknown>}
   */
  loadConfig(name) {
    try {
      const fileName = Path.join(name + '.json');
      return this.getConfig(fileName)
    } catch (err) {
      throw new Error(`E_LOAD_CONFIG: ${err.message}`)
    }
  }

  /**
   * Load config from file in config folder(either depending on the service you want to run)
   * @param {object} wrapper
   * @return {object}
   */
  async loadConfigWrapper(wrapper) {
    const listFile = Fs.readdirSync(this.config.path);
    listFile.splice(_.findIndex(listFile, (value) => value === `WRAPPER.json`),
      1);
    listFile.splice(_.findIndex(listFile, (value) => value === `${this.chatService}.json`),
      1);
    wrapper.server["LIST"] = [];
    for (let i = 0, length = listFile.length; i < length; i++) {
      const regex = /.json$/;
      if (regex.test(listFile[i])) {
        const prefix = listFile[i].substr(0, 2);
        const config = await this.getConfig(listFile[i]);
        const props = Object.keys(config.resourceServer);
        for (let j = 0, lngProps = props.length; j < lngProps; j++) {
          wrapper.resourceServer[`${prefix}_${props[j]}`] = config.resourceServer[`${props[j]}`]
        }
        const name = listFile[i].replace(regex, "");
        wrapper.server[`${name}_PORT`] = config.server["PORT"];
        wrapper.server["LIST"].push({
          prefix,
          name,
          PORT: config.server["PORT"],
        })
      }
    }
    return wrapper
  }

  /**
   * Check instance environment variables and initialize the environment object
   * @param {object} instanceEnv
   * @returns {void}
   */
  configEnv(instanceEnv) {
    const message = "object does not exist in the config file or it is not an object"
    if (!instanceEnv.server
      || typeof instanceEnv.server !== "object"
      || _.isArray(instanceEnv.server)) {
      throw new Error(`E_CONFIG_ENVIRONMENT: The server ${message}`);
    }
    if (!instanceEnv.chatService
      || typeof instanceEnv.chatService !== "object"
      || _.isArray(instanceEnv.chatService)) {
      throw new Error(`E_CONFIG_ENVIRONMENT: The chatService ${message}`);
    }
    if (!instanceEnv.resourceServer
      || typeof instanceEnv.resourceServer !== "object"
      || _.isArray(instanceEnv.resourceServer)) {
      throw new Error(`E_CONFIG_ENVIRONMENT: The resourceServer ${message}`);
    }
    Env.setConfig(instanceEnv);
  }

  /**
   * Config mysql database connection
   * @return {Promise<unknown>}
   */
  configMySQL() {
    return new Promise((resolve, reject) => {
      const configMysql = require('../config/MySQL')(Env.appRoot);
      const mysql = knex(configMysql);
      Model.knex(mysql);
      mysql.raw("SELECT VERSION()")
        .then(() => {
          return resolve(1)
        })
        .catch((err) => {
          const code = "E_ACCESS_MYSQL_ERROR";
          const message = err.sqlMessage ? err.sqlMessage : 'Access to mysql database denied';
          const error = new Error(`${code}: ${message}`);
          error.code = code;
          reject(error)
        })
    })
  }

  configRedis() {
    return new Promise((resolve, reject) => {
      const connectSuccess = () => {
        console.log("redis connect success");
        resolve(1)
      };

      const connectError = (e) => {
        const err = new Error(`E_CONNECT_REDIS: ${e.message}`);
        err.code = 'E_CONNECT_REDIS';
        Redis.close(connectSuccess, connectError);
        reject(err)
      };

      const option = {
        host: Env.getOrFail("REDIS_HOST"),
        port: Env.getOrFail("REDIS_PORT"),
      };

      Redis.setConfig(option, connectSuccess, connectError);
    })
  }

  healthCheckHandler(req, res, next) {
    try {
      return res.status(200).send({"pong": "OK"});
    } catch (e) {
      return res.status(400);
    }
  }

  chatServiceHandler(req, res, next) {
    return res.status(200).send("OK");
  }

  resourceServerHandler(req, res, next) {
    return res.status(200).send("OK");
  }

  pushMessageHandler(req, res, next) {
    return res.status(200).send("OK");
  }

  async init() {
    let instanceEnv = await this.loadConfig(this.resourceServer);
    if (this.resourceServer === "WRAPPER") {
      instanceEnv = await this.loadConfigWrapper(instanceEnv);
    }
    instanceEnv.chatService = await this.loadConfig(this.chatService);
    this.configEnv(instanceEnv);

    if (this.resourceServer === "WRAPPER" || /dev/.test(Env.get("NODE_ENV", "dev"))) {
      const mongoDB = await Mongo();
      const logModel = LogModel(mongoDB);
      require('../utils/logger')(this.app, this.instanceId, logModel)
    }

    await this.configMySQL();
    await this.configRedis();

    this.app.disable('x-powered-by');
    this.app.use(CookieParser());
    this.app.use(BodyParser.urlencoded({extended: true, limit: '2mb'}));
    this.app.use(BodyParser.json({limit: '2mb'}));

    this.app.get('/health-check', this.healthCheckHandler);
    this.app.post('/watch/chat-service', this.requestHandler.watchChatService);
    this.app.post('/watch/resource-server', this.requestHandler.watchResourceServer);
    this.app.post('/push/message', this.requestHandler.pushMessage);

    this.app.listen(Env.serverGOF("PORT"), () => {
      console.log('%s listening at %s', this.instanceId, Env.serverGOF("PORT"));
    });
  }

}

module.exports = BaseServer;
