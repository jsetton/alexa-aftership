'use strict';

const config = require('./config.js');
const location = require('./location.js');
const { tz } = require('./moment.js');

/**
 * Defines device location client class
 */
class DeviceLocationClient {
  constructor() {
    this.location = {};
  }

  get timezone() {
    return this._timezone || config.DEFAULT_TIMEZONE;
  }

  set timezone(value) {
    const zone = tz.zone(value);
    // Update timezone property only if valid
    if (zone) {
      this._timezone = zone.name;
    }
  }

  getAttributes() {
    return {
      location: this.location,
      timezone: this.timezone
    };
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
