'use strict';

const Alexa = require('ask-sdk-core');
const aftership = require('./aftership');
const config = require('./config');
const device = require('./device');
const { stripSpeechMarkup } = require('./utils');

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak(`${config.WELCOME_MESSAGE} ${config.HELP_MESSAGE}`)
      .reprompt(config.HELP_MESSAGE)
      .getResponse();
  }
};

const TrackingSearchIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'TrackingSearchIntent';
  },
  async handle(handlerInput) {
    const consentToken = handlerInput.requestEnvelope.context.System.user.permissions &&
      handlerInput.requestEnvelope.context.System.user.permissions.consentToken;
    const footnotes = [];

    // Check if device permission consent token defined
    if (!consentToken) {
      return handlerInput.responseBuilder
        .speak(config.DEVICE_PERM_NOT_GRANTED)
        .withAskForPermissionsConsentCard(config.PERMISSIONS)
        .getResponse();
    }

    // Check if Aftership API key configured
    if (!config.AFTERSHIP_API_KEY) {
      return handlerInput.responseBuilder
        .speak(config.AFTERSHIP_API_KEY_MISSING)
        .getResponse();
    }

    // Warn if Google Maps API key not configured
    if (!config.GOOGLE_MAPS_API_KEY) {
      console.warn(
        'The Google Maps API key is not configured. It is strongly recommended to use one.',
        'Please refer to the skill installation instructions.'
      );
    }

    try {
      const deviceId = Alexa.getDeviceId(handlerInput.requestEnvelope);
      const deviceAddressServiceClient = handlerInput.serviceClientFactory.getDeviceAddressServiceClient();
      // Get device address country and postal code
      const address = await deviceAddressServiceClient.getCountryAndPostalCode(deviceId);
      // Set device location information based on address
      await device.setLocationInformation(address);
    } catch (error) {
      // Catch device location errors
      if (Object.keys(device.location).length > 0) {
        console.warn('Using previously gatherered device location information.');
      } else {
        console.error('Unable to get device location information:', JSON.stringify(error));
        console.warn('Timezone set to default value:', device.timezone);
        footnotes.push(
          config.TIMESTAMP_DEFAULT_TIMEZONE.replace('{default_timezone}', device.timezone),
          config.DEVICE_LOCATION_NOT_FOUND
        );
      }
    }

    console.info('Device location information:', JSON.stringify(device.location));
    console.info('Device timezone set to:', device.timezone);

    try {
      // Generate trackings list
      const speech = await aftership.generateTrackingsList(
        Alexa.getSlotValue(handlerInput.requestEnvelope, 'keyword'),
        !config.MUTE_FOOTNOTES ? footnotes : []
      );
      // Send trackings speech output results
      return handlerInput.responseBuilder
        .speak(speech)
        .withStandardCard('Tracking Information', stripSpeechMarkup(speech),
          config.CARD_SMALL_IMG_URL, config.CARD_LARGE_IMG_URL)
        .getResponse();
    } catch (error) {
      // Catch AfterShip tracking errors
      console.error('Couln\'t get aftership trackings list:', JSON.stringify(error));
      return handlerInput.responseBuilder
        .speak(config.ERROR_MESSAGE)
        .getResponse();
    }
  }
};

const HelpIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak(config.HELP_MESSAGE)
      .reprompt(config.HELP_MESSAGE)
      .getResponse();
  }
};

const StopIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak(config.STOP_MESSAGE)
      .getResponse();
  }
};

const CancelIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak(config.CANCEL_MESSAGE)
      .getResponse();
  }
};

const UnhandledIntentHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak(`${config.UNHANDLED_MESSAGE} ${config.HELP_MESSAGE}`)
      .reprompt(config.HELP_MESSAGE)
      .getResponse();
  }
};

const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.error('Request error:', JSON.stringify(error));
    return handlerInput.responseBuilder
      .speak(config.ERROR_MESSAGE)
      .getResponse();
  }
};

const LogRequestInterceptor = {
  process(handlerInput) {
    if (config.DEBUG_MODE) {
      console.debug('Request received:', JSON.stringify(handlerInput.requestEnvelope));
    }
  }
};

const LogResponseInterceptor = {
  process(handlerInput, response) {
    if (config.DEBUG_MODE && response) {
      console.debug('Response sent:', JSON.stringify(response));
    }
  }
};

const skillBuilder = Alexa.SkillBuilders.custom();

exports.handler = skillBuilder
  .addRequestHandlers(
    LaunchRequestHandler,
    TrackingSearchIntentHandler,
    HelpIntentHandler,
    StopIntentHandler,
    CancelIntentHandler,
    UnhandledIntentHandler
  )
  .addRequestInterceptors(LogRequestInterceptor)
  .addResponseInterceptors(LogResponseInterceptor)
  .addErrorHandlers(ErrorHandler)
  .withApiClient(new Alexa.DefaultApiClient())
  .withSkillId(config.APP_ID)
  .lambda();
