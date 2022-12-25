import { getGeoLocation, getTimezoneId } from './location.js';
import moment from './moment.js';

/**
 * Defines device location client class
 */
class DeviceLocationClient {
  /**
   * Constructor
   */
  constructor() {
    this.location = {};
  }

  /**
   * Returns timezone
   * @return {String}
   */
  get timezone() {
    return this._timezone || process.env.DEFAULT_TIMEZONE;
  }

  /**
   * Sets timezone
   * @param  {String} value
   */
  set timezone(value) {
    const zone = moment.tz.zone(value);
    // Update timezone property only if valid
    if (zone) {
      this._timezone = zone.name;
    }
  }

  /**
   * Returns this device attributes
   * @return {Object}
   */
  getAttributes() {
    return {
      location: this.location,
      timezone: this.timezone
    };
  }

  /**
   * Updates this device attributes
   * @param {Object} location
   * @param {String} timezone
   */
  updateAttributes({ location, timezone }) {
    this.location = location;
    this.timezone = timezone;
  }

  /**
   * Sets location information based on given address
   * @param  {Object}  address
   * @return {Promise}
   */
  async setLocationInformation(address) {
    try {
      // Set device location geolocation data
      this.location = await getGeoLocation(`${address.countryCode},${address.postalCode}`);
      // Set device timezone id
      this.timezone = await getTimezoneId(`${this.location.lat},${this.location.lng}`);
    } catch (error) {
      throw error;
    }
  }
}

export default new DeviceLocationClient();
