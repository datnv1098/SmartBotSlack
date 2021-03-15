const {Model} = require("objection");

class ChannelMicrosoftCalendar extends Model {
  static get tableName() {
    return "channel_microsoft_calendar";
  }

  /* idColumn */
  static get idColumn() {
    return ["id_channel", "id_calendar"];
  }

  /* jsonSchema */
  static get jsonSchema() {
    return {
      type: "object",
      required: ["id_channel", "id_calendar"],
      properties: {
        id_channel: {type: "string"},
        id_calendar: {type: "string"},
        watch: {type: "boolean", default: true},
      },
    };
  }

  static get relationMappings() {
    const Channel = require("./Channel");
    const MicrosoftCalendar = require("./MicrosoftCalendar");
    return {
      channels: {
        relation: Model.HasOneRelation,
        modelClass: Channel,
        join: {
          from: "channel_microsoft_calendar.id_channel",
          to: "channel.id",
        },
      },
      google_account: {
        relation: Model.HasOneRelation,
        modelClass: MicrosoftCalendar,
        join: {
          from: "channel_microsoft_calendar.id_calendar",
          to: "microsoft_calendar.id",
        },
      },
    };
  }
}

module.exports = ChannelMicrosoftCalendar;
