const Env = require('../utils/Env');

const configDB = {
  client: 'mysql2',
  connection: {
    host: Env.getOrFail('MYSQL_DB_HOST'),
    port: Env.getOrFail('MYSQL_DB_PORT'),
    user: Env.getOrFail('MYSQL_DB_USER'),
    password: Env.getOrFail('MYSQL_DB_PASSWORD'),
    database: Env.getOrFail('MYSQL_DB_DATABASE'),
    charset: 'utf8mb4',
    timezone: Env.get('MYSQL_DB_TZ', 'Z'),
  },
  debug: Env.get('MYSQL_DB_DEBUG', false),
  pool: {
    min: 2,
    max: 10,
  }
};

module.exports = function (appRoot) {
  configDB.migrations = {directory: `${appRoot}/database/migrations`};
  configDB.seeds = {directory: `${appRoot}/database/seeds`};
  return configDB
};
