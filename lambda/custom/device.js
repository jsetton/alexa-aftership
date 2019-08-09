'use strict';

const config = require('./config');
const location = require('./location');
const moment = require('./moment');

/**
 * Defines device location client class
 */
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

  async setLocationInformation(address) {
    try {
      // Set device location geolocation data
      this.location = await location.getGeoLocation(`${address.countryCode},${address.postalCode}`);
      // Set device timezone id
      this.timezone = await location.getTimezoneId(`${this.location.lat},${this.location.lng}`);
    } catch (error) {
      throw error;
    }
  }
};

module.exports = new DeviceLocationClient();
