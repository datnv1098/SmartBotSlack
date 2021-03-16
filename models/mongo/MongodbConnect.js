const mongoose = require('mongoose');
const Env = require('../../utils/Env');
let uri = Env.getOrFail("BOT_DATABASE_URI");
const MongoConnect = () => {
  return mongoose.connect(uri, { useUnifiedTopology: true, useNewUrlParser: true, useFindAndModify: false, useCreateIndex: true });
};
module.exports = MongoConnect;
