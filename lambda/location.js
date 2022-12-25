import { Client } from '@googlemaps/google-maps-services-js';
import moment from './moment.js';

const client = new Client();

/**
 * Get formatted geolocation information from Google Maps geocode data
 * @param  {String}  address
 * @param  {Boolean} ignoreError
 * @return {Promise}
 */
export const getGeoLocation = async (address, ignoreError = false) => {
  try {
    const { data } = await client.geocode({
      params: { address, key: process.env.GOOGLE_MAPS_API_KEY }
    });
    const location = {};

    if (Array.isArray(data.results) && data.results.length > 0) {
      data.results[0].address_components.forEach((component) => {
        if (component.types.includes('postal_code')) {
          location.zipcode = component.long_name;
        } else if (component.types.includes('locality')) {
          location.city = component.long_name;
        } else if (component.types.includes('sublocality')) {
          location.city = result.city || component.long_name;
        } else if (component.types.includes('administrative_area_level_1')) {
          location.state = component.long_name;
        } else if (component.types.includes('country')) {
          location.country = component.long_name;
        }
      });

      location.lat = data.results[0].geometry.location.lat;
      location.lng = data.results[0].geometry.location.lng;
    }

    return location;
  } catch (error) {
    console.error('Failed to get geocode data', error);
    if (!ignoreError)
      throw error;
  }
};

/**
 * Get timeZoneId from Google Maps timezone data
 * @param  {String}  location
 * @param  {Boolean} ignoreError
 * @return {Promise}
 */
export const getTimezoneId = async (location, ignoreError = false) => {
  try {
    const { data } = await client.timezone({
      params: { location, timestamp: moment().unix(), key: process.env.GOOGLE_MAPS_API_KEY }
    });
    return data.timeZoneId;
  } catch (error) {
    console.error('Failed to get timezone data', error);
    if (!ignoreError)
      throw error;
  }
};
