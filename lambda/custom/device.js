'use strict';

const config = require('./config.js');
const location = require('./location.js');

/**
 * Defines device location client class
 */
class DeviceLocationClient {
  constructor() {
    this.location = {};
    this.timezone = config.DEFAULT_TIMEZONE;
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
