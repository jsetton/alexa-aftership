'use strict';

const config = require('./config');
const moment = require('./moment');
const request = require('request');

/**
 * Get Google Maps geocode data
 * @param  {String}  address
 * @return {Promise}
 */
function getGoogleMapsGeoCode(address) {
  const options = {
    url: `${config.GOOGLE_MAPS_API_ENDPOINT}/geocode/json`,
    qs: {
      address: address,
      key: config.GOOGLE_MAPS_API_KEY
    },
    method: 'GET'
  };

  return new Promise((resolve, reject) => {
    if (config.DEBUG_MODE)
      console.log('Google Maps geocode query:', JSON.stringify(options));
    handleApiRequest(options, resolve, reject);
  });
};

/**
 * Get formatted geolocation information from Google Maps geocode data
 * @param  {String}  address
 * @param  {Boolean} ignoreError
 * @return {Object}
 */
async function getGeoLocation(address, ignoreError) {
  try {
    const geodata = await getGoogleMapsGeoCode(address);
    const result = {};

    if (Array.isArray(geodata.results) && geodata.results.length > 0) {
      geodata.results[0].address_components.forEach((component) => {
        if (component.types.indexOf('postal_code') > -1) {
          result.zipcode = component.long_name;
        } else if (component.types.indexOf('locality') > -1) {
          result.city = component.long_name;
        } else if (component.types.indexOf('sublocality') > -1) {
          result.city = result.city || component.long_name;
        } else if (component.types.indexOf('administrative_area_level_1') > -1) {
          result.state = component.long_name;
        } else if (component.types.indexOf('country') > -1) {
          result.country = component.long_name;
        }
      });

      result.lat = geodata.results[0].geometry.location.lat;
      result.lng = geodata.results[0].geometry.location.lng;
    }

    return result;
  } catch (error) {
    console.error('Failed to get geocode data', JSON.stringify(error));
    if (!ignoreError)
      throw error;
  }
};

/**
 * Get Google Maps timezone data
 * @param  {String}  location
 * @return {Promise}
 */
function getGoogleMapsTimezone(location) {
  const options = {
    url: `${config.GOOGLE_MAPS_API_ENDPOINT}/timezone/json`,
    qs: {
      location: location,
      timestamp: moment().unix(),
      key: config.GOOGLE_MAPS_API_KEY
    },
    method: 'GET'
  };
  return new Promise((resolve, reject) => {
    if (config.DEBUG_MODE)
      console.debug('Google Maps timezone query:', JSON.stringify(options));
    handleApiRequest(options, resolve, reject);
  });
};

/**
 * Get timeZoneId from Google Maps timezone data
 * @param  {String}  location
 * @param  {Boolean} ignoreError
 * @return {String}
 */
async function getTimezoneId(location, ignoreError) {
  try {
    const timezone = await getGoogleMapsTimezone(location);
    return timezone.timeZoneId;
  } catch (error) {
    console.error('Failed to get timezone data', JSON.stringify(error));
    if (!ignoreError)
      throw error;
  }
};

/**
 * Handle API request using Promise functions
 * @param  {Object}   options
 * @param  {Function} resolve
 * @param  {Function} reject
 */
function handleApiRequest(options, resolve, reject) {
  request(options, (error, response, body) => {
    const json = JSON.parse(body);

    if (error) {
      reject(error);
    } else if (response.statusCode != 200 || (json.status && json.status != 'OK')) {
      reject(json);
    } else {
      resolve(json);
    }
  });
};

module.exports = {
  getGeoLocation: getGeoLocation,
  getTimezoneId: getTimezoneId
};
