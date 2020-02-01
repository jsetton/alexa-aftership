'use strict';

const Alexa = require('ask-sdk-core');
const { DynamoDbPersistenceAdapter } = require('ask-sdk-dynamodb-persistence-adapter');
const aftership = require('./aftership.js');
const config = require('./config.js');
const device = require('./device.js');
const events = require('./events.js');
const notification = require('./notification.js');
const { stripSpeechMarkup } = require('./utils.js');

const ProactiveScheduledEventHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'ScheduledEvent.ProactiveEvents'
  },
  async handle(handlerInput) {
    try {
      // Update device object based on user attributes from database
      Object.assign(device, await handlerInput.attributesManager.getPersistentAttributes());
      // Get trackings proactive events
      const events = await aftership.getProactiveEvents(handlerInput.requestEnvelope.request.interval);
      // Log proactive events if debug enabled
      if (config.DEBUG_MODE) {
        console.log('Proactive events:', JSON.stringify(events));
      }
      // Define proactive events notification promises, appending relevant audience property to each event
      const promises = events.map(event => notification.createProactiveEvent(
        Object.assign(event, {
          relevantAudience: {
            type: 'Unicast',
            payload: {
              user: Alexa.getUserId(handlerInput.requestEnvelope)
            }
          }
        })
      ));
      // Create all motifications
      await Promise.all(promises);
    } catch (error) {
      console.error('Failed to handle proactive scheduled event:', JSON.stringify(error));
    }
  }
}

const ProactiveSubscriptionChangedHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'AlexaSkillEvent.ProactiveSubscriptionChanged';
  },
  async handle(handlerInput) {
    try {
      // Set up notification event schedule if body is defined, otherwise remove it
      if (typeof handlerInput.requestEnvelope.request.body !== 'undefined') {
        await events.createSchedule(handlerInput.context.invokedFunctionArn, handlerInput.requestEnvelope.context);
        console.info('Event schedule has been created.');
      } else {
        await events.deleteSchedule();
        console.info('Event schedule has been deleted.');
      }
    } catch (error) {
      console.error('Failed to handle proactive subscription changed event:', JSON.stringify(error));
    }
  }
};

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
      // Store device attributes to database
      handlerInput.attributesManager.setPersistentAttributes({ device: device.getAttributes() });
      await handlerInput.attributesManager.savePersistentAttributes();
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
      // Get trackings speech output
      const speech = await aftership.getSpeechOutput(
        Alexa.getSlotValue(handlerInput.requestEnvelope, 'query'),
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
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest';
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
      console.log('Request received:', JSON.stringify(handlerInput.requestEnvelope));
    }
  }
};

const LogResponseInterceptor = {
  process(handlerInput, response) {
    if (config.DEBUG_MODE && response) {
      console.log('Response sent:', JSON.stringify(response));
    }
  }
};

const persistenceAdapter = new DynamoDbPersistenceAdapter({
  tableName: 'AlexaAfterShipSkillSettings',
  createTable: true,
  partitionKeyName: 'userId'
});

exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    ProactiveScheduledEventHandler,
    ProactiveSubscriptionChangedHandler,
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
  .withPersistenceAdapter(persistenceAdapter)
  .withSkillId(config.APP_ID)
  .lambda();
