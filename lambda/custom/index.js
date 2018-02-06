'use strict';

const Alexa = require("alexa-sdk");
const aftership = require('./aftership');
const ask = require('./helpers').ask;
const config = require('./config');
const device = require('./device');

const handlers = {
  'LaunchRequest': function() {
    this.response.speak(`${config.WELCOME_MESSAGE} ${config.HELP_MESSAGE}`).listen(config.HELP_MESSAGE);
    this.emit(':responseReady');
  },

  'TrackingSearchIntent': function() {
    let footnotes = [];

    // Check if Aftership API key configured
    if (!config.AFTERSHIP_API_KEY) {
      this.response.speak(config.AFTERSHIP_API_KEY_MISSING);
      this.emit(':responseReady');
      return;
    }

    // Warn if Google Maps API key not configured
    if (!config.GOOGLE_MAPS_API_KEY) {
      console.warn(
        'The Google Maps API key is not configured. It is strongly recommended to use one.',
        'Please refer to the skill installation instructions.'
      );
    }

    // Get device location information
    device.getLocationInformation(
      this.event.context.System.device.deviceId,
      this.event.context.System.apiEndpoint,
      this.event.context.System.apiAccessToken
    )
    // Catch device location errors
    .catch((error) => {
      if (Object.keys(device.location).length > 0) {
        console.warn('Using previously gatherered device location information.');
      } else {
        console.error('Unable to get device location information:', JSON.stringify(error, null, 2));
        console.warn('Timezone set to default value:', device.timezone);

        footnotes.push(
          config.TIMESTAMP_DEFAULT_TIMEZONE.replace('{default_timezone}', device.timezone),
          error.type && error.type == 'FORBIDDEN' ? config.DEVICE_PERM_NOT_GRANTED : config.DEVICE_LOCATION_NOT_FOUND
        );
      }
    })
    // Generate trackings list
    .then(() => {
      console.log('Device location information:', JSON.stringify(device.location, null, 2));
      console.log('Device timezone set to:', device.timezone);

      return aftership.generateTrackingsList(
        this.event.request.intent.slots.keyword.value,
        !config.MUTE_FOOTNOTES ? footnotes : []
      );
    })
    // Send trackings speech output results
    .then((speech) => {
      console.log('Trackings list:', speech);
      this.response.cardRenderer('Tracking Information', ask.stripSpeechMarkup(speech));
      this.response.speak(speech);
      this.emit(':responseReady');
    })
    // Catch AfterShip tracking errors
    .catch((error) => {
      console.error('Couln\'t get aftership trackings list:', JSON.stringify(error, null, 2));
      this.response.speak(config.ERROR_MESSAGE);
      this.emit(':responseReady');
    });
  },

  'AMAZON.HelpIntent': function() {
    this.response.speak(config.HELP_MESSAGE).listen(config.HELP_MESSAGE);
    this.emit(':responseReady');
  },

  'AMAZON.StopIntent': function () {
    this.response.speak(config.STOP_MESSAGE);
    this.emit(':responseReady');
  },

  'AMAZON.CancelIntent': function () {
    this.response.speak(config.CANCEL_MESSAGE);
    this.emit(':responseReady');
  },

  'Unhandled': function() {
    this.response.speak(`${config.UNHANDLED_MESSAGE} ${config.HELP_MESSAGE}`).listen(config.HELP_MESSAGE);
    this.emit(':responseReady');
  }
};

exports.handler = function(event, context) {
  let alexa = Alexa.handler(event, context);

  if (config.DEBUG_MODE)
    console.log('Received event:', JSON.stringify(event, null, 2));

  alexa.appId = config.APP_ID;
  alexa.registerHandlers(handlers);
  alexa.execute();
};
