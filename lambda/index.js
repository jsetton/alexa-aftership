import Alexa from 'ask-sdk-core';
import { DynamoDbPersistenceAdapter } from 'ask-sdk-dynamodb-persistence-adapter';
import { getProactiveEvents, getSpeechOutput } from './aftership.js';
import { createProactiveEvent, sendSkillMessage } from './api.js';
import device from './device.js';
import { createEventSchedule, deleteEventSchedule } from './events.js';
import moment from './moment.js';
import { sayAsSpeechMarkup, stripSpeechMarkup } from './utils.js';

/**
 * Defines speech messages
 * @type {Object}
 */
const SPEECH_MESSAGE = {
  Cancel: 'Cancelled',
  Error: `${sayAsSpeechMarkup('Uh oh', 'interjection')}, something went wrong.`,
  Help: "You can ask, track my shipments or where's my stuff? Now, what can I help you with?",
  Stop: 'Goodbye!',
  Unhandled: "Sorry, I didn't get that.",
  Welcome: 'Welcome to Aftership.'
};

/**
 * Defines skill event handler
 * @type {Object}
 */
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
        await createEventSchedule(
          handlerInput.context.invokedFunctionArn, Alexa.getUserId(handlerInput.requestEnvelope));
        console.info('Event schedule has been created.');
      } else {
        await deleteEventSchedule();
        console.info('Event schedule has been deleted.');
      }
      // Delete persistent attributes if not persistent status set on skill disabled event
      if (handlerInput.requestEnvelope.request.body.userInformationPersistenceStatus === 'NOT_PERSISTED') {
        await handlerInput.attributesManager.deletePersistentAttributes();
        console.info('User attributes have been deleted.');
      }
    } catch (error) {
      console.error('Failed to handle skill event:', error);
    }
  }
};

/**
 * Defines skill messaging handler
 * @type {Object}
 */
const SkillMessagingHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'Messaging.MessageReceived'
  },
  async handle(handlerInput) {
    try {
      // Get latest user attributes from database
      const attributes = await handlerInput.attributesManager.getPersistentAttributes();
      // Update device attributes based on user attribute
      device.updateAttributes(attributes.device);
      // Define current date based on device timezone
      const now = moment().tz(device.timezone);
      // Create proactive events if requested
      if (handlerInput.requestEnvelope.request.message.event === 'getProactiveEvents') {
        // Get trackings proactive events
        const events = await getProactiveEvents(attributes.lastProactiveEvent);
        // Log proactive events if debug enabled
        if (process.env.DEBUG_MODE === 'true') {
          console.log('Proactive events:', JSON.stringify(events));
        }
        // Define proactive events promises, appending relevant audience property to each event
        const promises = events.map(event => createProactiveEvent({
          ...event,
          relevantAudience: {
          type: 'Unicast',
            payload: {
              user: Alexa.getUserId(handlerInput.requestEnvelope)
            }
          }
        }));
        // Create all notifications
        await Promise.all(promises);
        // Store latest user attributes to database
        handlerInput.attributesManager.setPersistentAttributes({
          ...attributes,
          lastProactiveEvent: now.toISOString()
        });
        await handlerInput.attributesManager.savePersistentAttributes();
      }
    } catch (error) {
      console.error('Failed to handle skill messaging event:', error);
    }
  }
};

/**
 * Defines launch request handler
 * @type {Object}
 */
const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak(`${SPEECH_MESSAGE.Welcome} ${SPEECH_MESSAGE.Help}`)
      .reprompt(SPEECH_MESSAGE.Help)
      .getResponse();
  }
};

/**
 * Defines tracking search intent handler
 * @type {Object}
 */
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
        .speak("The device country and postal code permission haven't been granted. Please check the skill settings.")
        .withAskForPermissionsConsentCard(['read::alexa:device:all:address:country_and_postal_code'])
        .getResponse();
    }

    // Check if Aftership API key configured
    if (!process.env.AFTERSHIP_API_KEY) {
      return handlerInput.responseBuilder
        .speak('The Aftership API key is not configured. Please check the lambda function settings.')
        .getResponse();
    }

    // Warn if Google Maps API key not configured
    if (!process.env.GOOGLE_MAPS_API_KEY) {
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
      // Get latest user attributes from database
      const attributes = await handlerInput.attributesManager.getPersistentAttributes();
      // Store latest user attributes to database
      handlerInput.attributesManager.setPersistentAttributes({
        ...attributes,
        device: device.getAttributes()
      });
      await handlerInput.attributesManager.savePersistentAttributes();
    } catch (error) {
      // Catch device location errors
      if (Object.keys(device.location).length > 0) {
        console.warn('Using previously gatherered device location information.');
      } else {
        console.error('Unable to get device location information:', error);
        console.warn('Timezone set to default value:', device.timezone);
        footnotes.push(
          `All timestamps are defaulted to ${device.timezone} timezone.`,
          "The device location couldn't be determined. Please check the lambda function logs."
        );
      }
    }

    console.info('Device location information:', JSON.stringify(device.location));
    console.info('Device timezone set to:', device.timezone);

    try {
      // Get trackings speech output
      const speechOutput = await getSpeechOutput(
        Alexa.getSlotValue(handlerInput.requestEnvelope, 'query'),
        process.env.MUTE_FOOTNOTES === 'true' ? [] : footnotes
      );
      // Send trackings speech output results
      return handlerInput.responseBuilder
        .speak(speechOutput)
        .withStandardCard('Tracking Information', stripSpeechMarkup(speechOutput),
          process.env.CARD_SMALL_IMG_URL, process.env.CARD_LARGE_IMG_URL)
        .getResponse();
    } catch (error) {
      // Catch AfterShip tracking errors
      console.error("Couln't get aftership trackings list:", error);
      return handlerInput.responseBuilder
        .speak(SPEECH_MESSAGE.Error)
        .getResponse();
    }
  }
};

/**
 * Defines help intent handler
 * @type {Object}
 */
const HelpIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak(SPEECH_MESSAGE.Help)
      .reprompt(SPEECH_MESSAGE.Help)
      .getResponse();
  }
};

/**
 * Defines stop intent handler
 * @type {Object}
 */
const StopIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak(SPEECH_MESSAGE.Stop)
      .getResponse();
  }
};

/**
 * Defines cancel intent handler
 * @type {Object}
 */
const CancelIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak(SPEECH_MESSAGE.Cancel)
      .getResponse();
  }
};

/**
 * Defines unhandled intent handler
 * @type {Object}
 */
const UnhandledIntentHandler = {
  canHandle() {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak(`${SPEECH_MESSAGE.Unhandled} ${SPEECH_MESSAGE.Help}`)
      .reprompt(SPEECH_MESSAGE.Help)
      .getResponse();
  }
};

/**
 * Defines error handler
 * @type {Object}
 */
const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.error('Request error:', error);
    return handlerInput.responseBuilder
      .speak(SPEECH_MESSAGE.Error)
      .getResponse();
  }
};

/**
 * Defines log request interceptor
 * @type {Object}
 */
const LogRequestInterceptor = {
  process(handlerInput) {
    if (process.env.DEBUG_MODE === 'true') {
      console.log('Request received:', JSON.stringify(handlerInput.requestEnvelope));
    }
  }
};

/**
 * Defines log response interceptor
 * @type {Object}
 */
const LogResponseInterceptor = {
  process(handlerInput, response) {
    if (process.env.DEBUG_MODE === 'true' && response) {
      console.log('Response sent:', JSON.stringify(response));
    }
  }
};

/**
 * Defines persistent adapter
 * @type {DynamoDbPersistenceAdapter}
 */
const persistenceAdapter = new DynamoDbPersistenceAdapter({
  tableName: process.env.TABLE_NAME,
  partitionKeyName: 'userId'
});

/**
 * Handles scheduled event
 * @param  {Object}  event
 * @return {Promise}
 */
const scheduledEventHandler = async (event) => {
  try {
    console.log('Event received:', JSON.stringify(event));
    // Send skill message if relevant event type
    if (event.type === 'skillMessaging') {
      await sendSkillMessage(event.userId, event.message);
      console.log('Skill message sent:', JSON.stringify(event.message));
    }
  } catch (error) {
    console.error(`Failed to handle scheduled event ${event.type}:`, error);
  }
};

/**
 * Defines skill handler
 * @type {Object}
 */
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
  .withSkillId(process.env.SKILL_ID)
  .lambda();

export const handler = (event, context, callback) =>
  (event.source === 'aws.events' ? scheduledEventHandler : skillHandler)(event, context, callback);
