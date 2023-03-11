import got from 'got';

/**
 * Returns access token for a given scope
 * @param  {String}  scope
 * @return {Promise}
 */
const getAccessToken = (scope) => {
  const options = {
    method: 'POST',
    url: `${process.env.LWA_API_URL}/auth/o2/token`,
    json: {
      grant_type: 'client_credentials',
      scope,
      client_id: process.env.SKILL_CLIENT_ID,
      client_secret: process.env.SKILL_CLIENT_SECRET
    }
  };
  return got(options)
    .json()
    .then((response) => response.access_token);
};

/**
 * Create proactive event
 * @param  {Object}  parameters
 * @return {Promise}
 */
export const createProactiveEvent = async (parameters) => {
  const options = {
    method: 'POST',
    url: `${process.env.ALEXA_API_URL}/v1/proactiveEvents/stages/development`,
    headers: {
      Authorization: `Bearer ${await getAccessToken('alexa::proactive_events')}`
    },
    json: parameters
  };
  return got(options);
};

/**
 * Send skill message
 * @param  {String}  userId
 * @param  {Object}  data
 * @return {Promise}
 */
export const sendSkillMessage = async (userId, data) => {
  const options = {
    method: 'POST',
    url: `${process.env.ALEXA_API_URL}/v1/skillmessages/users/${userId}`,
    headers: {
      Authorization: `Bearer ${await getAccessToken('alexa:skill_messaging')}`
    },
    json: {
      data,
      expiresAfterSeconds: 60
    }
  };
  return got(options);
};
