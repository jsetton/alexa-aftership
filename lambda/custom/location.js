'use strict';

const config = require('./config');
const moment = require('./moment');
const request = require('request');

// Get Alexa device address country and postal codes
function getDeviceCountryAndPostalCode(deviceId, apiEndpoint, apiAccessToken) {
  let options = {
    url: `${apiEndpoint}/v1/devices/${deviceId}/settings/address/countryAndPostalCode`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiAccessToken}`
    }
  };

  return new Promise((resolve, reject) => {
    if (deviceId && apiEndpoint && apiAccessToken) {
      if (config.DEBUG_MODE)
        console.log('Device address query:', JSON.stringify(options, null, 2));
      handleApiRequest(options, resolve, reject);
    } else {
      reject('Missing device address api query parameters.');
    }
  });
};

// Get Google Maps geocode data
function getGoogleMapsGeoCode(address) {
  let options = {
    url: `${config.GOOGLE_MAPS_API_ENDPOINT}/geocode/json`,
    qs: {
      address: address,
      key: config.GOOGLE_MAPS_API_KEY
    },
    method: 'GET'
  };

  return new Promise((resolve, reject) => {
    if (config.DEBUG_MODE)
      console.log('Google Maps geocode query:', JSON.stringify(options, null, 2));
    handleApiRequest(options, resolve, reject);
  });
};

// Get formatted geolocation information from Google Maps geocode data
function getGeoLocation(address, ignoreError) {
  return getGoogleMapsGeoCode(address).then(
    (geodata) => {
      let result = {};

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
    },
    (error) => {
      console.error('Failed to get geocode data', JSON.stringify(error, null, 2));
      if (!ignoreError)
        throw error;
    }
  );
};

// Get Google Maps timezone data
function getGoogleMapsTimezone(location) {
  let options = {
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
      console.log('Google Maps timezone query:', JSON.stringify(options, null, 2));
    handleApiRequest(options, resolve, reject);
  });
};

// Get timeZoneId from Google Maps timezone data
function getTimezoneId(location, ignoreError) {
  return getGoogleMapsTimezone(location).then(
    (timezone) => {
      return timezone.timeZoneId;
    },
    (error) => {
      console.error('Failed to get timezone data', JSON.stringify(error, null, 2));
      if (!ignoreError)
        throw error;
    }
  );
};

// Handle API request using Promise functions
function handleApiRequest(options, resolve, reject) {
  request(options, (error, response, body) => {
    let json = JSON.parse(body);

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
  getDeviceCountryAndPostalCode: getDeviceCountryAndPostalCode,
  getGeoLocation: getGeoLocation,
  getTimezoneId: getTimezoneId
};
