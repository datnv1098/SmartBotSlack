const Axios = require("axios");
const qs = require("qs");
const Env = require("../../utils/Env");
const GoogleAccount = require("../../models/GoogleAccount");
const GoogleCalendar = require("../../models/GoogleCalendar");
const Channels = require("../../models/Channels");
const GoogleAccountCalendar = require("../../models/GoogleAccountCalendar");
const ChannelsCalendar = require("../../models/ChannelsCalendar");
const Redis = require("../../utils/redis/index");

/**
 * Thực hiện việc lấy accesToken
 * @param {string}code
 * @param {string}state
 * @returns {Promise}
 */
const getToken = (code, state) => {
	return new Promise((resolve, reject) => {
		let url = Env.resourceServerGet("API_URL_OAUTH");
		url += `${Env.resourceServerGet("API_TOKEN")}`;
		let data = {
			client_id: Env.resourceServerGet("CLIENT_ID"),
			client_secret: Env.resourceServerGet("CLIENT_SECRET"),
			code,
			grant_type: Env.resourceServerGet("GRANT_TYPE"),
			redirect_uri: Env.resourceServerGet("REDIRECT_URI"),
			state,
		};
		const options = {
			method: "POST",
			headers: {"content-type": "application/x-www-form-urlencoded"},
			data: qs.stringify(data),
			url,
		};
		Axios(options)
			.then((res) => resolve(res.data))
			.catch((err) => reject(err));
	});
};
const watchGoogleCalendar = async (idCalendar,idAccount)=>{
	const options = {
		method: 'POST',
		url:`https://www.googleapis.com/calendar/v3/calendars/${idCalendar}/events/watch`,
		headers: {'X-Google-AccountId': idAccount},
		data:{
			id: "00304594-a576-4f8d-bc7a-956492",
			type: "web_hook",
			address: "https://apis.iceteait.com/watch/resource-server",
			"token": `${idAccount}${idCalendar}`,
		}
	}
	const done = await Axios(options);
	console.log("done",done)
	return done
}
/**
 * Thông qua accessToken để list ra calendar
 * @param{string} accessTokenGoogle
 * @returns {Promise}
 */
const getListCalendar = (idAccount) => {
	const options = {
		method: "GET",
		headers: {'X-Google-AccountId': idAccount},
		url:
			Env.resourceServerGOF("API_URL") +
			Env.resourceServerGOF("API_lIST_CALENDAR"),
	};
	return new Promise((resolve, reject) => {
		Axios(options)
			.then((res) => resolve(res.data))
			.catch((error) => reject(error));
	});
};

/**
 * accessToken để lấy ra info
 * @param {string} accessTokenGoogle
 * @returns {Promise}
 */
const getProfile = (accessTokenGoogle) => {
	let url = Env.resourceServerGet("API_URL");
	url += `${Env.resourceServerGet("API_USER_INFO")}`;
	return new Promise((resolve, reject) => {
		const options = {
			method: "GET",
			headers: {Authorization: `Bearer ${accessTokenGoogle}`},
			url: url,
		};
		Axios(options)
			.then((res) => resolve(res.data))
			.catch((err) => reject(err));
	});
};

/**
 *
 * @param idChannel
 * @return {Promise<unknown>}
 */
const getInfoChannel = (idChannel) => {
	return new Promise((resolve, reject) => {
		let url = Env.chatServiceGOF("API_URL");
		url += Env.chatServiceGOF("API_CHANNEL_INFO");
		url += idChannel;
		const options = {
			method: "GET",
			headers: {Authorization: `Bearer ${Env.chatServiceGOF("BOT_TOKEN")}`},
			data: qs.stringify({channel: idChannel}),
			url,
		};
		Axios(options)
			.then((res) => resolve(res.data))
			.catch((err) => reject(err));
	});
};

/**
 * Lưu profile end  refreshTokenGoogle
 * @param  {object} profileUser
 * @param {string} refreshTokenGoogle
 * @returns {Promise}
 */
const saveUserProfile = async (profileUser, refreshTokenGoogle, accessTokenGoogle) => {
	const account = {
		id: profileUser.sub,
		name: profileUser.name,
		refresh_token: refreshTokenGoogle,
		created_at: null,
		updated_at: null,
	}
	const data = await GoogleAccount.query().findById(account.id);
	return new Promise((resolve, reject) => {
		Redis.client.setex(account.id,60 * 59, accessTokenGoogle)
		if (!data) {
			GoogleAccount.query()
				.insert(account)
				.then((res) => {
					return resolve(res)
				})
				.catch((err) => reject(err));
		}
		resolve();
	})
};

/**
 * Lưu list calendar
 * @param {Array} listCalendar
 * @returns {Promise}
 */
const saveListCalendar = async (listCalendar) => {
	if (!listCalendar) return null;
	const length = listCalendar.length;
	for (let i = 0; i < length; i++) {
		const calendar = await GoogleCalendar.query().findOne({id: listCalendar[i].id});
		if (!calendar) await GoogleCalendar
			.query()
			.insert({
				id: listCalendar[i].id,
				name: listCalendar[i].summary,
			})
	}
	return true;
};

/**
 * Luu thong tin channel vao database
 * @param {object} channel
 * @returns {Promise}
 */
const saveInfoChannel = (channel) => {
	return Channels.query().insert({
		id: channel.id,
		name: channel.name,
	});
};

/**
 * Lưu IdCalendar với idAccount vào db
 * @param {array} idCalendars
 * @param {String} idAccount
 * @returns {Promise}
 * @constructor
 */
const SaveGoogleAccountCalendar = (idCalendars, idAccount) => {
	return GoogleAccountCalendar.transaction(async trx => {
		try {
			let values = []
			for (let idx in idCalendars) {
				const googleAccountCalendar = {
					id_calendar: idCalendars[idx],
					id_account: idAccount,
					created_at: null,
				};
				values.push(googleAccountCalendar)
			}
			await trx.insert(values).into(GoogleAccountCalendar.tableName).onConflict(["id_calendar", "id_account"]).merge();
		} catch (e) {
			trx.rollback();
			throw e
		}
	})
};

/**
 * Lưu IdCalendar với idChannel vào db
 * @param {array} idCalendars
 * @param {String}idChannel
 * @returns {Promise}
 * @constructor
 */
const SaveChannelsCalendar = async (idCalendars, idChannel) => {
	return ChannelsCalendar.transaction(async trx => {
		try {
			let values = [];
			for (let idx in idCalendars) {
				const ChannelsCalendar = {
					id_calendar: idCalendars[idx],
					id_channel: idChannel,
					watch: true,
					created_at: null,
					updated_at: null,
				};
				values.push(ChannelsCalendar)
			}
			await trx.insert(values).into(ChannelsCalendar.tableName).onConflict(["id_calendar", "id_channel"]).merge();
		} catch (e) {
			trx.rollback();
			throw e
		}
	})
};


module.exports = {
	getToken,
	getListCalendar,
	getProfile,
	getInfoChannel,
	saveUserProfile,
	saveInfoChannel,
	saveListCalendar,
	SaveGoogleAccountCalendar,
	SaveChannelsCalendar,
	watchGoogleCalendar
};
