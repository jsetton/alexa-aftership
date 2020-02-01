'use strict';

const Alexa = require('ask-sdk-core');
const { DynamoDbPersistenceAdapter } = require('ask-sdk-dynamodb-persistence-adapter');
const aftership = require('./aftership.js');
const { ProactiveEventsApi, SkillMessagingApi } = require('./api.js');
const config = require('./config.js');
const device = require('./device.js');
const events = require('./events.js');
const { stripSpeechMarkup } = require('./utils.js');

const SkillEventHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'AlexaSkillEvent.SkillDisabled' ||
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'AlexaSkillEvent.ProactiveSubscriptionChanged';
  },
  async handle(handlerInput) {
    try {
      // Determine proactive subscriptions
      const subscriptions = handlerInput.requestEnvelope.request.body.subscriptions || [];
      // Set up event schedule if subscriptions not empty, otherwise delete it
      if (subscriptions.length > 0) {
        await events.createSchedule(
          handlerInput.context.invokedFunctionArn, Alexa.getUserId(handlerInput.requestEnvelope));
        console.info('Event schedule has been created.');
      } else {
        await events.deleteSchedule();
        console.info('Event schedule has been deleted.');
      }
      // Delete persistent attributes if not persistent status set on skill disabled event
      if (handlerInput.requestEnvelope.request.body.userInformationPersistenceStatus === 'NOT_PERSISTED') {
        await handlerInput.attributesManager.deletePersistentAttributes();
        console.info('User attributes have been deleted.');
      }
    } catch (error) {
      console.error('Failed to handle skill event:', JSON.stringify(error));
    }
  }
};

const SkillMessagingHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'Messaging.MessageReceived'
  },
  async handle(handlerInput) {
    try {
      // Update device object based on user attributes from database
      Object.assign(device, await handlerInput.attributesManager.getPersistentAttributes());
      // Create proactive events if requested
      if (handlerInput.requestEnvelope.request.message.event === 'getProactiveEvents') {
        // Get trackings proactive events
        const events = await aftership.getProactiveEvents(handlerInput.requestEnvelope.request.message.interval);
        // Log proactive events if debug enabled
        if (config.DEBUG_MODE) {
          console.log('Proactive events:', JSON.stringify(events));
        }
        // Initialize proactive events api object
        const api = new ProactiveEventsApi(config.API_ENDPOINT, config.CLIENT_ID, config.CLIENT_SECRET);
        // Define proactive events promises, appending relevant audience property to each event
        const promises = events.map(event => api.createProactiveEvent(
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
      }
    } catch (error) {
      console.error('Failed to handle skill messaging event:', JSON.stringify(error));
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

const scheduledEventHandler = async (event) => {
  try {
    console.log('Event received:', JSON.stringify(event));
    // Send skill message if relevant event type
    if (event.type === 'skillMessaging') {
      const api = new SkillMessagingApi(
        config.API_ENDPOINT, config.CLIENT_ID, config.CLIENT_SECRET, event.userId);
      await api.sendMessage(event.message);
      console.log('Skill message sent:', JSON.stringify(event.message));
    }
  } catch (error) {
    console.error(`Failed to handle scheduled event ${event.type}:`, JSON.stringify(error));
  }
};

const skillHandler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    SkillEventHandler,
    SkillMessagingHandler,
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

exports.handler = (event, context, callback) =>
  (event.source === 'aws.events' ? scheduledEventHandler : skillHandler)(event, context, callback);
