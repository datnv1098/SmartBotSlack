const Axios = require("axios");
const Crypto = require("../../utils/Crypto");
const Env = require("../../utils/Env");
const MomentTimezone = require('moment-timezone');
const Moment = require('moment');
const { blockTime, getDurationDay } = require('../../utils/ConvertTime');
const { v4: uuidv4 } = require('uuid');
require('moment-precise-range-plugin');

/**
 * get Events Todays
 * @param {idCalendar} idCalendar
 * return events
 */
const getEventsTodays = (account, j, start, end) => {
  const option = {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Microsoft-AccountId": account.id,
    },
    url: Env.resourceServerGOF("GRAPH_URL") +
      Env.resourceServerGOF("GRAPH_CALENDARS") +
      `/${account.calendar[j].id}/calendarView/delta?startdatetime=${start}&enddatetime=${end}`
  };
  return Axios(option);
}
/**
 * convert Blocks Events
 * @param {Array} events
 * @returns {Array} blocks
 */
const convertBlocksEvents = (body, template) => {
  const { events } = body;
  const blocks = [...template.listEvent.blocks];
  blocks[0].elements[0].image_url = `${Env.serverGOF("URL_PUBLIC")}/icon/MICROSOFT.png`;
  const blockEvent = JSON.stringify(blocks[1]);
  blocks.splice(1, 1);
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    let item = blockEvent;
    item = JSON.parse(item);
    item.block_id = `MI_${event.idAccount}/${event.id}/${event.subject}/${i}`;
    item.accessory.options[0].value = `edit/${event.idCalendar}`;
    item.accessory.options[1].value = `del/${event.idCalendar}`;
    item.fields[0].text = `*${event.subject}*`;

    if (event.location && event.location.displayName !== '') {
      item.fields[4].text = `Location: ${event.location.displayName}`;
    }
    const datetimeStart = Moment(event.start.dateTime).utc(true).utcOffset(event.timezone).format("DD-MM-YYYYTHH:mm");
    const datetimeEnd = Moment(event.end.dateTime).utc(true).utcOffset(event.timezone).format("DD-MM-YYYYTHH:mm");
    item.fields[1].text = `Calendar: ${event.nameCalendar}`;
    if (event.isAllDay) {
      item.fields[2].text = `Day Start: ` + datetimeStart.split('T')[0];
      item.fields[3].text = `Day end: ` + datetimeEnd.split('T')[0];
    } else {
      item.fields[2].text = `Day: ${datetimeStart.split('T')[0]}`;
      item.fields[3].text = `Time: ${datetimeStart.split('T')[1]}`;
      item.fields[3].text += " - " + datetimeEnd.split('T')[1];
    }
    blocks.splice(i + 1, 0, item);
  }
  return blocks;
}


/**
 * Show modals view edit event to slack
 * @param {Object} payload
 * @param {Object} template
 * @param {Array} timePicker
 * @returns {Promise}
 */
const handlerEditEvent = (payload, template) => {
  const { eventEditDT, calendars, idCalendar, userInfo } = payload;
  let editView = { ...template.editEvent, blocks: [...template.editEvent.blocks] };
  editView.callback_id = `${editView.callback_id}/${eventEditDT.id}`;
  for (let i = 0, length = calendars.length; i < length; i++) {
    const item = calendars[i];
    const selectCalendars = {
      "text": {
        "type": "plain_text",
        "text": item.name,
        "emoji": true
      },
      "value": item.id
    }
    if (item.id === idCalendar) {
      editView.blocks[1].accessory.initial_option = selectCalendars;
    }
    editView.blocks[1].accessory.options.push(selectCalendars);
  }
  editView.blocks[2].element.initial_value = eventEditDT.subject;
  if (eventEditDT.locations[0]) {
    editView.blocks[8].element.initial_value = eventEditDT.locations[0].displayName;
  }
  const datetimeStart = Moment(eventEditDT.start.dateTime).utc(true).utcOffset(userInfo.user.tz).format();
  const datetimeEnd = Moment(eventEditDT.end.dateTime).utc(true).utcOffset(userInfo.user.tz).format();
  editView.blocks[4].accessory.initial_date = datetimeStart.split('T')[0];
  const lengthEditBlocks = editView.blocks.length;

  if (eventEditDT.recurrence) {
    editView.blocks[lengthEditBlocks - 2].element.initial_option = repeatInitOption(eventEditDT.recurrence.pattern.type);
  }
  editView.blocks[lengthEditBlocks - 1].element.initial_option = reminderStartInitOptions(eventEditDT.reminderMinutesBeforeStart);

  let durationDay = 1;
  if (eventEditDT.isAllDay) {
    durationDay = getDurationDay(datetimeStart, datetimeEnd);
    editView.blocks.splice(6, 2);
    editView.blocks[5].accessory.initial_date = datetimeEnd.split('T')[0];
    editView.blocks[3].accessory.initial_options =
      [
        {
          "value": "true",
          "text": {
            "type": "plain_text",
            "text": "All day"
          }
        }
      ]
  } else {
    const initialOption = {
      "text": {
        "type": "plain_text",
        "text": blockTime(datetimeStart),
        "emoji": true
      },
      "value": blockTime(datetimeStart)
    }
    const initialOption2 = {
      "text": {
        "type": "plain_text",
        "text": blockTime(datetimeEnd),
        "emoji": true
      },
      "value": blockTime(datetimeEnd)
    }
    editView.blocks[6].accessory.initial_option = initialOption;
    editView.blocks[7].accessory.initial_option = initialOption2;
    editView.blocks.splice(5, 1);
  }
  let dateTime = MomentTimezone(eventEditDT.start.dateTime).tz(userInfo.user.tz).format();
  const timeStart = blockTime(dateTime);
  editView.private_metadata = JSON.stringify({
    ...userInfo,
    dateTime,
    durationTime: 15,
    durationDay: durationDay,
    startTime: timeStart
  });
  return editView;
};

/**
 * Xu ly phan Overflow Action ( Sua hoac xoa su kien)
 * @param {Object} payload
 * @param {Object} template
 * @returns {Promise}
 */
const handlerOverflowAction = (payload, template) => {
  const value = payload.actions[0].selected_option.value.split('/');
  if (value[0] === "edit") {
    return handlerEditEvent(payload, template);
  } else if (value[0] === "del") {
    return showDeleteEventView(payload, template);
  }
}

/**
 * init option remider
 * @param {number} number
 * @returns {Object}
 */
const reminderStartInitOptions = (number) => {
  const initialOption = {
    "text": {
      "type": "plain_text",
      "text": "At time of event",
      "emoji": true
    },
    "value": "0"
  }
  if (number >= 60) {
    initialOption.text.text = "1 hours before";
    initialOption.value = "60";
    return initialOption;
  } else if (number >= 30) {
    initialOption.text.text = "30 minutes before";
    initialOption.value = "30";
    return initialOption;
  } else if (number >= 15) {
    initialOption.text.text = "15 minutes before";
    initialOption.value = "15";
    return initialOption;
  } else {
    return initialOption;
  }
}

/**
 * init option repeat
 * @param {string} type
 * @returns {Object}
 */
const repeatInitOption = (type) => {
  const initialOption = {
    "text": {
      "type": "plain_text",
      "text": "Nomal",
      "emoji": true
    },
    "value": "nomal"
  }
  switch (type) {
    case "nomal":
      return initialOption;
    case "daily":
      initialOption.text.text = "Every day";
      initialOption.value = "daily"
      return initialOption;
    case "weekly":
      initialOption.text.text = "Every week";
      initialOption.value = "weekly"
      return initialOption;
    case "absoluteMonthly":
      initialOption.text.text = "Every month";
      initialOption.value = "absoluteMonthly"
      return initialOption;
    default:
      return initialOption;
  }
}

/**
 * Show modals view edit event to slack
 * @param {Object} payload
 * @param {Object} template
 * @returns {Promise}
 */
const configAddEvent = async (body, template) => {
  const { trigger_id, calendars, userInfo } = body;
  const view = {
    ...template.addEvent,
    blocks: [...template.addEvent.blocks]
  };

  // chọn calendar default cho view add event
  view.blocks[1].accessory.initial_option = calendars[0];
  view.blocks[1].accessory.options = calendars;

  // lấy thời gian theo timezone người dùng slack
  const dateNow = new Date();
  let dateTime = MomentTimezone(dateNow).tz(userInfo.user.tz).format("YYYY-MM-DDTHH:mm:ssZ");
  view.blocks[4].accessory.initial_date = Moment(dateTime).format("YYYY-MM-DD");

  // xử lý time start, time end default
  let startTime = blockTime(dateTime);
  let endTime = blockTime(Moment(dateTime).add(15, 'm').format());

  // sau 23:30 --> 00:00 thì ngày khởi tạo event sẽ là ngày mới, thời gian
  // khởi tạo event là 00:00
  const time = Moment(dateTime).format("HH:mm").split(":");
  if (parseInt(time[0]) >= 23 && parseInt(time[1]) >= 30) {
    startTime = "00:00";
    endTime = "00:15";
    const timezone = Moment(dateTime).format("Z");
    dateTime = `${Moment(dateTime).add(1, 'd')}T${startTime}:00${timezone}`
  }

  // gán time default cho view
  view.blocks[6].accessory.initial_option = {
    "text": {
      "type": "plain_text",
      "text": startTime,
      "emoji": true
    },
    "value": startTime
  };
  view.blocks[7].accessory.initial_option = {
    "text": {
      "type": "plain_text",
      "text": endTime,
      "emoji": true
    },
    "value": endTime
  };

  // lưu dữ liệu cache vào view phục vụ cho update view về sau
  view.private_metadata = JSON.stringify({ ...userInfo, dateTime, durationTime: 15, startTime });
  view.blocks.splice(5, 1);

  // khởi tạo option cho request tới slack.
  let option = { method: "POST" };
  option.url = Env.chatServiceGOF('API_URL');
  option.url += Env.chatServiceGOF('API_VIEW_OPEN');
  option.headers = { 'Authorization': `Bearer ${Env.chatServiceGet("BOT_TOKEN")}` };
  option.data = {
    "trigger_id": trigger_id,
    view
  };

  return option
};

/**
 * xử lý action All đây
 * @param {object} payload
 * @param {array} blocks
 * @returns {object}
 */
const handlerAllDay = (payload, blocks) => {
  const { selected_options } = payload.actions[0];
  const { view } = payload;
  const { durationDay, dateTime, durationTime } = JSON.parse(view.private_metadata);

  // All day checked
  if (selected_options.length > 0) {
    if (!durationDay) {
      blocks[5].accessory.initial_date = Moment(dateTime).format("YYYY-MM-DD");
    } else {
      blocks[5].accessory.initial_date = Moment(dateTime)
        .add(durationDay, 'd')
        .format("YYYY-MM-DD");
    }
    view.blocks.splice(5, 2, blocks[5]);
    return view;
  }

  // event one-date
  const startTime = blockTime(dateTime);
  const timeStart = { ...blocks[6] };
  timeStart.accessory.initial_option = {
    "text": {
      "type": "plain_text",
      "text": startTime,
      "emoji": true
    },
    "value": startTime
  };
  const endTime = blockTime(Moment(dateTime).add(durationTime, 'm').format());
  const timeEnd = { ...blocks[7] };
  timeEnd.accessory.initial_option = {
    "text": {
      "type": "plain_text",
      "text": endTime,
      "emoji": true
    },
    "value": endTime
  };
  view.blocks.splice(5, 1, timeEnd);
  view.blocks.splice(5, 0, timeStart);
  return view;
};

/**
 * Xử lý action start date
 * @param {object} payload
 * @param {array} blocks
 * @returns {object}
 */
function handlerStartDate(payload, blocks) {
  const { view } = payload;
  const { values } = view.state;
  const priMetadata = JSON.parse(view.private_metadata);
  const selectedDate = values["MI_select-date-start"]["datepicker-action-start"]["selected_date"];
  const timezone = Moment(priMetadata.dateTime).format("Z");
  const dateTime = `${selectedDate}T${priMetadata.startTime}:00${timezone}`;
  priMetadata.dateTime = MomentTimezone(dateTime).tz(priMetadata.user.tz).format();
  view.private_metadata = JSON.stringify(priMetadata);
  if (values["MI_check_all_day"]["allDay"]["selected_options"].length === 0) return view;
  if (priMetadata.durationDay && priMetadata.durationDay > 0) {
    blocks[5].accessory.initial_date = Moment(priMetadata.dateTime)
      .add(priMetadata.durationDay, 'd')
      .format("YYYY-MM-DD");
  } else {
    blocks[5].accessory.initial_date = selectedDate
  }
  view.blocks.splice(5, 1, blocks[5]);
  if (view.blocks[5].block_id === 'MI_select-date-end-1') {
    view.blocks[5].block_id = "MI_select-date-end"
  } else {
    view.blocks[5].block_id = "MI_select-date-end-1"
  }
  return view
}

/**
 * Get value select date
 * @param {Object} values
 * @param {string} blockId
 * @param {string} actionId
 * @returns {string}
 */
function _getSelectedDate(values, blockId, actionId) {
  if (!values[blockId]) {
    return values[`${blockId}-1`][actionId]["selected_date"];
  } else {
    return values[blockId][actionId]["selected_date"];
  }
}

/**
 * Get value select options
 * @param {Object} values
 * @param {string} blockId
 * @param {string} actionId
 * @returns {string}
 */
function _getSelectedOption(values, blockId, actionId) {
  if (!values[blockId]) {
    return values[`${blockId}-1`][actionId]["selected_option"].value;
  } else {
    return values[blockId][actionId]["selected_option"].value;
  }
}

/**
 * Xử lý action end date
 * @param {object} payload
 * @param {array} blocks
 * @returns {object}
 */
function handlerEndDate(payload, blocks) {
  const { view } = payload;
  const { values } = view.state;
  const priMetadata = JSON.parse(view.private_metadata);
  const selectedDate = _getSelectedDate(values, "MI_select-date-end", "datepicker-action-end");
  const dateTime = priMetadata.dateTime.split("T")[0];
  let diff = Moment.preciseDiff(dateTime, selectedDate, true);
  if (diff.firstDateWasLater) {
    if (priMetadata.durationDay) {
      blocks[5].accessory.initial_date = Moment(priMetadata.dateTime)
        .add(priMetadata.durationDay, 'd')
        .format("YYYY-MM-DD");
    } else {
      blocks[5].accessory.initial_date = Moment(priMetadata.dateTime).format("YYYY-MM-DD")
    }
    view.blocks.splice(5, 1, blocks[5]);
    if (view.blocks[5].block_id === 'MI_select-date-end-1') {
      view.blocks[5].block_id = "MI_select-date-end"
    } else {
      view.blocks[5].block_id = "MI_select-date-end-1"
    }
    return view
  }
  priMetadata.durationDay = diff.days;
  view.private_metadata = JSON.stringify(priMetadata);
  blocks[5].accessory.initial_date = selectedDate;
  view.blocks.splice(5, 1, blocks[5]);
  if (view.blocks[5].block_id === 'MI_select-date-end-1') {
    view.blocks[5].block_id = "MI_select-date-end"
  } else {
    view.blocks[5].block_id = "MI_select-date-end-1"
  }
  return view
}

/**
 * Xử lý action start time
 * @param {object} payload
 * @returns {object}
 */
function handlerStartTime(payload) {
  const { view } = payload;
  const { values } = view.state;
  const priMetadata = JSON.parse(view.private_metadata);

  const selectedTime = _getSelectedOption(values, "MI_select-time-start", "time-start-action");
  const timeEnd = _getSelectedOption(values, "MI_select-time-end", "time-end-action");

  const date = priMetadata.dateTime.split("T")[0];
  const timezone = Moment(priMetadata.dateTime).format("Z");
  const datetimeStart = `${date}T${selectedTime}:00${timezone}`;
  const datetimeEnd = `${date}T${timeEnd}:00${timezone}`;
  let diff = Moment.preciseDiff(datetimeStart, datetimeEnd, true);
  if (diff.firstDateWasLater || selectedTime === timeEnd) {
    view.blocks[5].accessory.initial_option = {
      "text": {
        "type": "plain_text",
        "text": blockTime(priMetadata.dateTime),
        "emoji": true
      },
      "value": blockTime(priMetadata.dateTime)
    };
    if (view.blocks[5].block_id === 'MI_select-time-start-1') {
      view.blocks[5].block_id = "MI_select-time-start"
    } else {
      view.blocks[5].block_id = "MI_select-time-start-1"
    }
    return view;
  }

  priMetadata.dateTime = datetimeStart;
  if (diff.hours > 0) priMetadata.durationTime = diff.hours * 60 + diff.minutes;
  priMetadata.startTime = selectedTime;
  view.private_metadata = JSON.stringify(priMetadata);
  return view;
}

/**
 * Xử lý action end time
 * @param {object} payload
 * @returns {object}
 */
function handlerEndTime(payload) {
  const { view } = payload;
  const { values } = view.state;
  const priMetadata = JSON.parse(view.private_metadata);

  const selectedTime = _getSelectedOption(values, "MI_select-time-end", "time-end-action");
  const timeStart = _getSelectedOption(values, "MI_select-time-start", "time-start-action");

  const date = priMetadata.dateTime.split("T")[0];
  const timezone = Moment(priMetadata.dateTime).format("Z");
  const datetimeStart = `${date}T${timeStart}:00${timezone}`;
  const datetimeEnd = `${date}T${selectedTime}:00${timezone}`;
  let diff = Moment.preciseDiff(datetimeStart, datetimeEnd, true);
  if (diff.firstDateWasLater || selectedTime === timeStart) {
    let timeEnd = Moment(datetimeStart).add(priMetadata.durationTime, 'm').format();
    timeEnd = blockTime(timeEnd);
    view.blocks[6].accessory.initial_option = {
      "text": {
        "type": "plain_text",
        "text": timeEnd,
        "emoji": true
      },
      "value": timeEnd
    };
    if (view.blocks[6].block_id === 'MI_select-time-end-1') {
      view.blocks[6].block_id = "MI_select-time-end"
    } else {
      view.blocks[6].block_id = "MI_select-time-end-1"
    }
    return view;
  }
  priMetadata.dateTime = datetimeStart;
  if (diff.hours > 0) priMetadata.durationTime = diff.hours * 60 + diff.minutes;
  view.private_metadata = JSON.stringify(priMetadata);
  return view;
}

/**
 * handler Blocks Actions
 * @param {Object} payload
 * @param {Object} template
 * @returns {Promise}
 */
function handlerBlocksActions(payload, template) {
  const changePayload = delPropsView(payload);
  const { action_id } = changePayload.actions[0];
  const { blocks } = template.addEvent;
  let option = {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${Env.chatServiceGOF("BOT_TOKEN")}` },
    url: `${Env.chatServiceGOF("API_URL")}${Env.chatServiceGOF("API_VIEW_UPDATE")}`,
    data: {
      "view_id": payload["container"]["view_id"]
    }
  };
  switch (action_id) {
    case "allDay":
      option.data.view = handlerAllDay(changePayload, blocks);
      break;
    case "datepicker-action-start":
      option.data.view = handlerStartDate(changePayload, blocks);
      break;
    case "datepicker-action-end":
      option.data.view = handlerEndDate(changePayload, blocks);
      break;
    case "time-start-action":
      option.data.view = handlerStartTime(changePayload);
      break;
    case "time-end-action":
      option.data.view = handlerEndTime(changePayload);
      break;
    case "overflow-action":
      delete option.data.view_id;
      option.url = Env.chatServiceGet("API_URL") + Env.chatServiceGet("API_VIEW_OPEN")
      option.data.trigger_id = payload.trigger_id;
      option.data.view = handlerOverflowAction(payload, template);
      break;
    default:
      break;
  }
  if (option.data.view) {
    delete option.data.view.state;
    return option;
  }
  return null;
};

/**
 * Thuc hien xoa event
 * @param {string} idAccount
 * @param {string} idEvent
 * @returns {Promise}
 */
const showDeleteEventView = (payload, template) => {
  let view = template.deleteEvent;
  view.private_metadata = payload.actions[0].block_id;
  view.private_metadata += "/" + payload.actions[0].selected_option.value;
  view.blocks[0].text.text = "Delete event : " + payload.actions[0].block_id.split('/')[2];
  view.blocks[1].text.text = "Event of calendar : " + payload.calendar.name;
  return view;
}

/**
 * Thuc hien xoa event
 * @param {string} payload
 * @returns {Promise}
 */
const submitDelEvent = (payload) => {
  const idAccount = payload.view.private_metadata.split("/")[0].split('MI_')[1];
  const idEvent = payload.view.private_metadata.split("/")[1];
  const options = {
    method: 'DELETE',
    headers: { 'X-Microsoft-AccountId': idAccount },
    url: `${Env.resourceServerGOF("GRAPH_URL")}${Env.resourceServerGOF("GRAPH_MY_EVENT")}/${idEvent}`
  };
  return options;
}

/**
 *
 * @param {string} type
 * @param {dateTime} datetime
 * @param {*} date
 */
const getRecurrence = (type, datetime) => {
  const dateStart = datetime;
  const recurrence = {
    "pattern": {
      "type": "daily",
      "interval": 1,
      "month": 0,
      "dayOfMonth": 0,
      "daysOfWeek": [
        "monday"
      ],
      "index": "first"
    },
    "range": {
      "type": "endDate",
      "startDate": dateStart,
      "endDate": dateStart
    }
  }
  datetime = datetime.split('-');
  var date = new Date(datetime[0], datetime[1], datetime[2]);
  switch (type) {
    case "daily":
      recurrence.pattern.type = "daily"
      let dateD = date.addDays(60);
      recurrence.range.endDate = dateD.getFullYear() + "-" + dateD.getMonth() + "-" + dateD.getDate()
      break;
    case "weekly":
      recurrence.pattern.type = "weekly";
      let dateW = date.addDays(150);
      recurrence.range.endDate = dateW.getFullYear() + "-" + dateW.getMonth() + "-" + dateW.getDate()
      break;
    case "absoluteMonthly":
      recurrence.pattern.type = "absoluteMonthly"
      recurrence.pattern.dayOfMonth = datetime[2];
      recurrence.pattern.firstDayOfWeek = "sunday";
      let dateM = date.addDays(365);
      recurrence.range.endDate = dateM.getFullYear() + "-" + dateM.getMonth() + "-" + dateM.getDate()
      break;
    default:
      break;
  }
  return recurrence;
}

/**
 * _get Selected Option
 * @param {strig} values
 * @param {string} blockId
 * @param {string} actionId
 */
function _getSelectedOption(values, blockId, actionId) {
  if (!values[blockId]) {
    return values[`${blockId}-1`][actionId]["selected_option"].value;
  } else {
    return values[blockId][actionId]["selected_option"].value;
  }
}

/**
 * Submit event
 * @param {Object} values
 * @param {Object} account
 * @returns {Promise}
 */
const submitAddEvent = (values, account) => {
  let timezone = account.timezone;
  const location = values["MI_input_location"]["plain_text_input-action"].value;
  const recurrence = values["MI_select_everyday"]["static_select-action"]["selected_option"].value;
  const noti = values["MI_select_before_notification"]["static_select-action"]["selected_option"].value;
  const allDay = values["MI_check_all_day"]["allDay"]["selected_options"];
  const startDate = values["MI_select-date-start"]["datepicker-action-start"]["selected_date"];
  const dateEnd = startDate;

  const event = {
    "reminderMinutesBeforeStart": noti,
    "isReminderOn": true,
    "subject": values['MI_input_title']['input-action'].value,
    "isAllDay": false,
    "start": {
      "dateTime": `${startDate}T00:00:00`,
      "timeZone": `UTC`
    },
    "end": {
      "dateTime": `${dateEnd}T00:00:00`,
      "timeZone": `UTC`
    },
    "location": {
      "displayName": location,
    }
  }
  if (allDay.length === 0) {
    const timeStart = _getSelectedOption(values, "MI_select-time-start", "time-start-action");
    const timeEnd = _getSelectedOption(values, "MI_select-time-end", "time-end-action");

    const dateTimeStart = `${startDate}T${timeStart}:00${timezone}`;
    const dateTimeEnd = `${dateEnd}T${timeEnd}:00${timezone}`;

    event.start.dateTime = dateTimeStart;
    event.end.dateTime = dateTimeEnd;
    if (recurrence !== "nomal") {
      event.recurrence = getRecurrence(recurrence, startDate);
    }
  } else {
    const endDate = _getSelectedDate(values, "MI_select-date-end", "datepicker-action-end");
    event.isAllDay = true;
    event.end.dateTime = `${endDate}T00:00:00`;
  }
  if (event.reminderMinutesBeforeStart === 'default') {
    event.reminderMinutesBeforeStart = 0;
  }
  return event;
};

/**
 * Tao url request author
 * @param {string} idChannel
 * @param {string} idUser
 * @param {function} setUidToken
 * @returns {string} urlRequestAuthor
 */
const redirectMicrosoft = (idChannel, idUser, setUidToken) => {
  const scopeAzure = Env.resourceServerGet("SCOPE");
  const data = {
    uid: uuidv4(),
    idChannel,
    idUser
  }
  const stateAzure = Crypto.createJWT(data);
  setUidToken(data.uid);
  let urlRequestAuthor = `${Env.resourceServerGet(
    "API_URL_AUTH"
  )}${Env.resourceServerGet("API_AUTHOR")}`;
  urlRequestAuthor += `?client_id=${Env.resourceServerGet("AZURE_ID")}`;
  urlRequestAuthor += `&response_type=code&redirect_uri=${Env.resourceServerGet(
    "AZURE_REDIRECT"
  )}`;
  urlRequestAuthor += `&response_mode=query&scope=${encodeURIComponent(scopeAzure)}&state=${stateAzure}`;
  return urlRequestAuthor;
};

/**
 * Xu ly gui tin nhan yeu cau login
 * @param {object} event
 * @param {view} viewLoginResource
 * @param {function} setUidToken
 * @returns {Promise}
 */
const sendMessageLogin = (event, template, setUidToken) => {
  const blocks = [...template.loginResource];
  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Env.chatServiceGOF("BOT_TOKEN")}`,
    },
    data: {
      channel: event.channel,
      blocks,
    },
    url:
      Env.chatServiceGet("API_URL") +
      Env.chatServiceGet("API_POST_MESSAGE"),
  };
  const { channel, inviter } = event;
  options.data.blocks[2].elements[1].url = redirectMicrosoft(
    channel,
    inviter,
    setUidToken
  );
  return options;
};

/**
 * Xu ly nguoi dung goi den settings
 * @param {object} viewSystemSetting
 * @param {function} setUidToken
 * @param {object} body
 * @returns {Promise}
 */
const handlerSettingsMessage = (viewSystemSetting, body, setUidToken) => {
  return new Promise((resolve, reject) => {
    const data = {
      trigger_id: body.trigger_id,
      view: viewSystemSetting,
    };
    const options = {
      method: "POST",
      headers: { Authorization: `Bearer ${Env.chatServiceGOF("BOT_TOKEN")}` },
      data: data,
      url:
        Env.chatServiceGet("API_URL") +
        Env.chatServiceGet("API_VIEW_OPEN"),
    };
    const { channel_id, user_id } = body;
    options.data.view.blocks[3].elements[1].url = redirectMicrosoft(
      channel_id,
      user_id,
      setUidToken
    );
    Axios(options)
      .then((data) => resolve(data))
      .catch(reject);
  });
};

/**
 * Xóa các thành phần của view
 * @param {object} payload
 * @return {object}
 */
function delPropsView(payload) {
  if (payload.view) {
    delete payload.view.id;
    delete payload.view.team_id;
    delete payload.view.hash;
    delete payload.view.previous_view_id;
    delete payload.view.root_view_id;
    delete payload.view.app_id;
    delete payload.view.app_installed_team_id;
    delete payload.view.bot_id;
  }
  return payload;
}


module.exports = {
  handlerSettingsMessage,
  sendMessageLogin,
  configAddEvent,
  submitAddEvent,
  handlerBlocksActions,
  submitDelEvent,
  getEventsTodays,
  convertBlocksEvents
};
