const Env = require('../../utils/Env');
const {getDurationDay} = require('../../utils/ConvertTime');
const axios = require('axios');
const moment = require('moment');

/**
 *  Lay event
 * @param {string} idUser
 * @param {string} idEvent
 * @returns {Promise}
 */
const getEvent = (idUser, idEvent) => {
  const options = {
    method: 'GET',
    headers: {
      'X-Microsoft-AccountId': idUser
    },
    url: `${Env.resourceServerGOF("GRAPH_URL")}${Env.resourceServerGOF("GRAPH_MY_EVENT")}/${idEvent}`
  };
  return axios(options);
};

/**
 * Gui tin nhan ve channel
 * @param {string} type
 * @param {array} channels
 * @param {object} event
 * @param {object} view
 * @return {array}
 */
const handlerData = (type, channels, event, view) => {
  const blocks = [...view.blocks];
  blocks[0].elements[0].image_url = `${Env.serverGOF("URL_PUBLIC")}/icon/MICROSOFT.png`;
  blocks[1].fields[0].text = `*${event.subject}*`;
  blocks[1].fields[1].text = `Calendar: ${event.nameCalendar}`;
  blocks[0].elements[2].text = type;
  let location = "";
  if (event.locations.length > 0) {
    location = `\nLocation: ${event.locations.map(value => value.displayName).join(", ")}`;
  }
  let description = "";
  if (event.bodyPreview) description = `\nDescription: ${event.bodyPreview}`;
  blocks[3].text.text = location + description;
  if (!event.bodyPreview && event.locations.length === 0) blocks.splice(3, 1);
  const datetimeStart = moment(event.start.dateTime).utc(true).utcOffset(event.timezone);
  const datetimeEnd = moment(event.end.dateTime).utc(true).utcOffset(event.timezone);
  if (event.isAllDay) {
    const dateStart = datetimeStart.format("DD-MM-YYYY");
    const dateEnd = datetimeEnd.add(-1, "d").format("DD-MM-YYYY");
    blocks[2].fields[0].text = `Start: ${dateStart}`;
    blocks[2].fields[1].text = `End: ${dateEnd}`;
    const data = [];
    channels.forEach(item => {
      data.push({channel: item.id_channel, blocks})
    });
    return data;
  }

  const day = getDurationDay(datetimeStart.format(), datetimeEnd.format());
  if (day) {
    blocks[2].fields[0].text = `Day Start: ${datetimeStart.format("YYYY-MM-DD")}\n`;
    blocks[2].fields[0].text += `Time: ${datetimeStart.format("HH:mm")}`;
    blocks[2].fields[1].text = `Day end: ${datetimeEnd.format("YYYY-MM-DD")}\n`;
    blocks[2].fields[1].text += `Time: ${datetimeEnd.format("HH:mm")}`;
  } else {
    blocks[2].fields[0].text = `Day: ${datetimeStart.format("DD-MM-YYYY")}`;
    blocks[2].fields[1].text = `Time: ${datetimeStart.format("HH:mm")}`;
    blocks[2].fields[1].text += ` - ${datetimeEnd.format("HH:mm")}`;
  }
  const data = [];
  channels.forEach(item => {
    data.push({channel: item.id_channel, blocks,})
  });
  return data;
}

module.exports = {
  getEvent,
  handlerData,
}
