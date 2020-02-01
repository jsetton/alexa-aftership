'use strict';

const request = require('request-promise-native');

/**
 * Defines Alexa Skill API class
 */
class AlexaSkillApi {
  /**
   * Constructor
   * @param {String} clientId
   * @param {String} clientSecret
   * @param {String} scope
   */
  constructor(clientId, clientSecret, scope = '') {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.scope = scope;
  }

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
        scope: this.scope,
        client_id: this.clientId,
        client_secret: this.clientSecret
      }
    };
    return request(options)
      .then(({ access_token }) => this.accessToken = access_token);
  }
}

/**
 * Defines Alexa Proactive Events API class
 * @extends AlexaSkillApi
 */
class ProactiveEventsApi extends AlexaSkillApi {
  /**
   * Constructor
   * @param {String} apiUrl
   * @param {String} clientId
   * @param {String} clientSecret
   */
  constructor(apiUrl, clientId, clientSecret) {
    super(clientId, clientSecret, 'alexa::proactive_events');
    this.apiUrl = apiUrl;
  }

  /**
   * Create proactive event
   * @param  {Object}  parameters
   * @return {Promise}
   */
  async createProactiveEvent(parameters = {}) {
    const options = {
      method: 'POST',
      uri: `${this.apiUrl}/v1/proactiveEvents/stages/development`,
      auth: {
        bearer: this.accessToken || await this.getAccessToken()
      },
      json: parameters
    };
    return request(options);
  }
}

/**
 * Defines Alexa Skill Messaging API class
 * @extends AlexaSkillApi
 */
class SkillMessagingApi extends AlexaSkillApi {
  /**
   * Constructor
   * @param {String} apiUrl
   * @param {String} clientId
   * @param {String} clientSecret
   * @param {String} userId
   */
  constructor(apiUrl, clientId, clientSecret, userId) {
    super(clientId, clientSecret, 'alexa:skill_messaging');
    this.apiUrl = apiUrl;
    this.userId = userId;
  }

  /**
   * Send message
   * @param  {Object}  data
   * @return {Promise}
   */
  async sendMessage(data = {}) {
    const options = {
      method: 'POST',
      uri: `${this.apiUrl}/v1/skillmessages/users/${this.userId}`,
      auth: {
        bearer: this.accessToken || await this.getAccessToken()
      },
      json: {
        data: data,
        expiresAfterSeconds: 60
      }
    };
    return request(options);
  }
}

module.exports = {
  ProactiveEventsApi,
  SkillMessagingApi
};
