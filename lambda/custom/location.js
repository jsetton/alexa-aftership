'use strict';

const request = require('request-promise-native');
const config = require('./config.js');
const moment = require('./moment.js');

/**
 * Get Google Maps geocode data
 * @param  {String}  address
 * @return {Promise}
 */
function getGoogleMapsGeoCode(address) {
  const options = {
    method: 'GET',
    uri: `${config.GOOGLE_MAPS_API_ENDPOINT}/geocode/json`,
    qs: {
      address: address.replace(/\s+/g, '+'),
      key: config.GOOGLE_MAPS_API_KEY
    },
    json: true
  };

  if (config.DEBUG_MODE)
    console.log('Google Maps geocode query:', JSON.stringify(options));

  return request(options);
};

/**
 * Get formatted geolocation information from Google Maps geocode data
 * @param  {String}  address
 * @param  {Boolean} ignoreError
 * @return {Object}
 */
async function getGeoLocation(address, ignoreError) {
  try {
    const { results } = await getGoogleMapsGeoCode(address);
    const result = {};

    if (Array.isArray(results) && results.length > 0) {
      results[0].address_components.forEach((component) => {
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

      result.lat = results[0].geometry.location.lat;
      result.lng = results[0].geometry.location.lng;
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
    method: 'GET',
    uri: `${config.GOOGLE_MAPS_API_ENDPOINT}/timezone/json`,
    qs: {
      location: location,
      timestamp: moment().unix(),
      key: config.GOOGLE_MAPS_API_KEY
    },
    json: true
  };

  if (config.DEBUG_MODE)
    console.log('Google Maps timezone query:', JSON.stringify(options));

  return request(options);
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

module.exports = {
  getGeoLocation,
  getTimezoneId
};
