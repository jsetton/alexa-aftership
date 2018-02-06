'use strict';

const config = require('./config');
const location = require('./location');
const moment = require('./moment');

class DeviceLocationClient {
  constructor() {
    this.location = {};
    this.timezone = config.DEFAULT_TIMEZONE;
  }

  get timezone() {
    return this._timezone;
  }

  set timezone(value) {
    this._timezone = value;
    this.today = moment().tz(value).startOf('day');
  }

  getLocationInformation(deviceId, apiEndpoint, apiAccessToken) {
    // Get device address country and postal code
    return location.getDeviceCountryAndPostalCode(deviceId, apiEndpoint, apiAccessToken)
    // Get device location geolocation data
    .then((device) => location.getGeoLocation(`${device.countryCode},${device.postalCode}`))
    // Store device geolocation data in aftership object
    .then((geodata) => { this.location = geodata; return `${geodata.lat},${geodata.lng}`; })
    // Get timezone information
    .then((address) => location.getTimezoneId(address))
    // Store device timezone in aftership object
    .then((timezone) => { this.timezone = timezone; })
    // Catch all errors
    .catch((error) => { throw error; });
  }
};

module.exports = new DeviceLocationClient();
