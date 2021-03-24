const {Model} = require("objection");

class ChannelGoogleAccount extends Model {
  static get tableName() {
    return "channel_google_account";
  }

  /* idColumn */
  static get idColumn() {
    return ["id_channel", "id_account"];
  }

  /* jsonSchema */
  static get jsonSchema() {
    return {
      type: "object",
      required: ["id_channel", "id_account"],
      properties: {
        id_channel: {type: "string"},
        id_account: {type: "string"},
      },
    };
  }

  static get relationMappings() {
    const Channel = require("./Channel");
    const GoogleAccount = require("./GoogleAccount");
    return {
      channels: {
        relation: Model.HasOneRelation,
        modelClass: Channel,
        join: {
          from: "channel_google_account.id_channel",
          to: "channel.id",
        },
      },
      google_account: {
        relation: Model.HasOneRelation,
        modelClass: GoogleAccount,
        join: {
          from: "channel_google_account.id_account",
          to: "google_account.id",
        },
      },
    };
  }
}

module.exports = ChannelGoogleAccount;
