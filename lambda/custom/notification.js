'use strict';

const request = require('request-promise-native');
const config = require('./config.js');

/**
 * Defines proactive event notification client class
 */
class NotificationClient {
  /**
   * Returns proactive events access token
   * @return {Promise}
   */
  getAccessToken() {
    const options = {
      method: 'POST',
      uri: 'https://api.amazon.com/auth/o2/token',
      json: {
        grant_type: 'client_credentials',
        scope: 'alexa::proactive_events',
        client_id: config.CLIENT_ID,
        client_secret: config.CLIENT_SECRET
      }
    };
    return request(options)
      .then(({ access_token }) => this.accessToken = access_token);
  }

  /**
   * Create proactive event
   * @param  {Object}  parameters
   * @return {Promise}
   */
  async createProactiveEvent(parameters = {}) {
    const options = {
      method: 'POST',
      uri: `${config.API_ENDPOINT}/v1/proactiveEvents/stages/development`,
      auth: {
        bearer: this.accessToken || await this.getAccessToken()
      },
      json: parameters
    };
    return request(options);
  }
}

module.exports = new NotificationClient();
