const Path = require('path');
const Fs = require('fs-extra');
const Env = require('../../utils/Env');

class TemplateSlack {
  constructor() {
    this.addEvent = null;
    this.deleteEvent = null;
    this.editEvent = null;
    this.eventEndDate = null;
    this.eventTimeStart = null;
    this.eventTimeEnd = null;
    this.homePage = null;
    this.listCalendar = null;
    this.listEvent = null;
    this.loginResource = null;
    this.showEvent = null;
    this.systemSetting = null;
    this.eventStartDate = null;
  }

  /**
   * Read config file from config folder(either depending on the service you want to run)
   * @param pathFile
   * @returns {Promise<unknown>}
   */
  readFileTemplate(pathFile) {
    return new Promise((resolve, reject) => {
      Fs.readJson(Path.join(pathFile), (err, text) => {
        if (err) reject(err);
        resolve(text)
      });
    });
  }

  /**
   * Add prefix for block_id and callback_id
   * @param {string} prefix
   * @private
   */
  _renameBlockAndCallbackID(prefix) {
    const props = Object.keys(this);
    props.forEach((value, i) => {
      const {callback_id, blocks, block_id} = this[value];
      if (blocks && blocks.length > 0) {
        if (callback_id) {
          this[value].callback_id = `${prefix}_${callback_id}`;
        } else {
          this[value].callback_id = `${prefix}_callback-id-${i}`;
        }
        blocks.forEach((element, idx) => {
          if (element.block_id) {
            element.block_id = `${prefix}_${element.block_id}`;
          } else {
            element.block_id = `${prefix}_${element.type}_${idx}`
          }
        })
      } else if (this[value] instanceof Array) {
        this[value].forEach((element, idx) => {
          if (element.block_id) {
            element.block_id = `${prefix}_${element.block_id}`;
          } else {
            element.block_id = `${prefix}_${element.type}_${idx}`
          }
        })
      } else {
        if (block_id) {
          this[value].block_id = `${prefix}_${block_id}`;
        } else {
          this[value].block_id = `${prefix}_${this[value].type}_${i}`
        }
      }
    })
  }

  /**
   *
   * @param {string} id
   * @return {string}
   */
  getBlockId(id) {
    return `${this._prefix}_${id}`
  }

  /**
   * Create time picker
   * @return {[]}
   * @private
   */
  _customDatetime() {
    let arrayDT = [];
    let i = 0;
    while (i < 24) {
      let j = 0;
      for (j = 0; j < 46; j++) {
        let datetimePicker = {
          "text": {
            "type": "plain_text",
            "text": "",
            "emoji": true
          },
          "value": ""
        };
        let textH = "";
        let textM = "";
        if (j < 10) {
          textM = `0${j}`;
        } else {
          textM = `${j}`;
        }
        if (i < 10) {
          textH = `0${i}:` + textM;
        } else if (i < 12) {
          textH = `${i}:` + textM;
        } else {
          textH = `${i}:` + textM;
        }
        datetimePicker.text.text = textH;
        datetimePicker.value = textH.slice(0, 5);
        arrayDT.push(datetimePicker);
        j += 14;
      }
      i++;
    }
    return arrayDT;
  }

  /**
   * Init template slack
   * @param {string} prefix
   * @return {TemplateSlack}
   */
  async init(instanceId) {
    try {
      let prefix = instanceId.split("-")[1];
      prefix = prefix.substr(0, 2);
      let pathFile = Env.appRoot + '/slack/views';
      this.addEvent = await this.readFileTemplate(`${pathFile}/AddEvent.json`);
      let timeStart = [...this._customDatetime()];
      const timeEnd = [...timeStart];
      timeStart.pop();
      timeEnd.shift();
      this.addEvent.blocks[6].accessory.options = timeStart;
      this.addEvent.blocks[7].accessory.options = timeEnd;
      this.deleteEvent = await this.readFileTemplate(`${pathFile}/DeleteEvent.json`);
      this.editEvent = await this.readFileTemplate(`${pathFile}/EditEvent.json`);
      this.editEvent.blocks[6].accessory.options = timeStart;
      this.editEvent.blocks[7].accessory.options = timeEnd;
      this.eventEndDate = await this.readFileTemplate(`${pathFile}/EventEndDate.json`);
      this.eventTimeStart = await this.readFileTemplate(`${pathFile}/EventTimeStart.json`);
      this.eventTimeEnd = await this.readFileTemplate(`${pathFile}/EventTimeEnd.json`);
      this.homePage = await this.readFileTemplate(`${pathFile}/HomePage.json`);
      this.listCalendar = await this.readFileTemplate(`${pathFile}/ListCalendar.json`);
      this.listEvent = await this.readFileTemplate(`${pathFile}/ListEvent.json`);
      this.loginResource = await this.readFileTemplate(`${pathFile}/LoginResource.json`);
      this.showEvent = await this.readFileTemplate(`${pathFile}/ShowEvent.json`);
      this.systemSetting = await this.readFileTemplate(`${pathFile}/SystemSetting.json`);
      this.eventStartDate = await this.readFileTemplate(`${pathFile}/EventStartDate.json`);
      this._renameBlockAndCallbackID(prefix);
      this._prefix = prefix;
      return this;
    } catch (e) {
      console.log("⇒⇒⇒ Handler Command ERROR: ", e);
    }
  }
}

let template = "";
module.exports = function () {
  if (!template) {
    template = new TemplateSlack();
    return template
  }
  return template
};
