const Env = require('../../utils/Env');
const Axios = require('axios');
const moment = require('moment-timezone');
const {getDurationDay} = require('../../utils/ConvertTime');

/**
 * Get google calendar event updates
 * @param {object} headers
 * @param {string} idAccount
 * @return {Promise}
 */
const getEventUpdate = (headers, idAccount) => {
  return new Promise((resolve, reject) => {
    const dateNow = new Date();
    const options = {
      url: headers['x-goog-resource-uri'],
      method: 'GET',
      headers: {'X-Google-AccountId': idAccount},
      params: {
        updatedMin: new Date(dateNow - (5 * 60 * 1000)).toISOString(),
      },
    };
    Axios(options)
      .then(result => {
        const {items} = result.data;
        const legItem = items.length;
        if (legItem === 0) resolve(null);
        resolve(items[legItem - 1])
      })
      .catch(err => {
        reject(err)
      });
  });
};

/**
 * Get google calendar event updates
 * @param {string} idCalendar
 * @param {string} idEvent
 * @param {string} idAccount
 * @return {Promise}
 */
const getEvent = (idCalendar, idEvent, idAccount) => {
  return new Promise((resolve, reject) => {
    const options = {
      url: Env.resourceServerGOF("API_URL"),
      method: 'GET',
      headers: {'X-Google-AccountId': idAccount},
    };
    options.url += Env.resourceServerGOF("API_CALENDAR");
    options.url += `/${idCalendar}`;
    options.url += `/events/${idEvent}`;
    Axios(options)
      .then(result => resolve(result.data))
      .catch(err => reject(err));
  });
};

/**
 *
 * @param {array} channels
 * @param {array} showEvent
 * @param {object} event
 * @returns {array}
 */
const makeData = (channels, showEvent, event) => {
  const blocks = [...showEvent];
  blocks[0].elements[0].image_url = `${Env.serverGOF("URL_PUBLIC")}/icon/GOOGLE_CALENDAR.png`;
  blocks[0].elements[1].text = "*CALENDAR GOOGLE*";
  if (event.recurrence) {
    blocks[0].elements[3].text = `*Repeat: ${event.recurrence[0].split('=')[1]}*`;
  }
  blocks[1].fields[0].text = `*${event.summary}*`;
  blocks[1].fields[1].text = `Calendar: ${event.organizer.email}`;
  if (event.organizer.displayName) {
    blocks[1].fields[1].text = `Calendar: ${event.organizer.displayName}`;
  }
  if (event.status === 'cancelled') {
    blocks[0].elements[2].text = "*Type: Delete Event*";
    blocks.length = 2;
    blocks.push({"type": "divider"});
    const data = [];
    channels.forEach(item => {
      data.push({channel: item.id_channel, blocks})
    })
    return data;
  }

  let location = event.location ? `\nLocation: ${event.location}` : "";
  let description = event.description ? `\nDescription: ${event.description}` : "";
  blocks[3].text.text = location + description;
  if (!event.location && !event.description) blocks.splice(3, 1);

  const created = moment(event.created).unix() + 1;
  const updated = moment(event.updated).unix();
  if (event.status === "confirmed" && updated > created) {
    blocks[0].elements[1].text = "*CALENDAR GOOGLE*";
    blocks[0].elements[2].text = "*Type: Update  Event*";
  } else {
    blocks[0].elements[1].text = "*CALENDAR GOOGLE*";
    blocks[0].elements[2].text = "*Type: Create Event*";
  }

  if (event.start.date && event.end.date) {
    const dateStart = moment(event.start.date).format("DD-MM-YYYY");
    const dateEnd = moment(event.end.date).add(-1, "d").format("DD-MM-YYYY");
    blocks[2].fields[0].text = `Start: ${dateStart}`;
    blocks[2].fields[1].text = `End: ${dateEnd}`;
    const data = [];
    channels.forEach(item => {
      data.push({channel: item.id_channel, blocks})
    })
    return data;
  }

  const datetimeStart = moment(event.start.dateTime).tz(event.timezone);
  const datetimeEnd = moment(event.end.dateTime).tz(event.timezone);
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
    data.push({channel: item.id_channel, blocks})
  })
  return data;
}

module.exports = {
  getEventUpdate,
  makeData,
  getEvent,
};
