'use strict';

const ask = require('./helpers').ask;

module.exports = Object.freeze({
  // Alexa
  APP_ID: process.env.ALEXA_APP_ID || '',
  DEBUG_MODE: process.env.DEBUG_MODE || false,
  DEFAULT_COUNTRY: process.env.DEFAULT_COUNTRY || 'United States',
  DEFAULT_TIMEZONE: process.env.DEFAULT_TIMEZONE || 'US/Eastern',
  MUTE_FOOTNOTES: process.env.MUTE_FOOTNOTES || false,

  // Aftership
  AFTERSHIP_API_KEY: process.env.AFTERSHIP_API_KEY || '',
  AFTERSHIP_DAYS_PAST_DELIVERED: process.env.AFTERSHIP_DAYS_PAST_DELIVERED || 1,
  AFTERSHIP_DAYS_SEARCH: process.env.AFTERSHIP_DAYS_SEARCH || 30, // AfterShip only stores data up to 90 days
  AFTERSHIP_NOTE_TAGGING: process.env.AFTERSHIP_NOTE_TAGGING || null,
  AFTERSHIP_TRACKING_COUNT_LIMIT: process.env.AFTERSHIP_TRACKING_COUNT_LIMIT || 20,

  // Google Maps
  GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY || '',
  GOOGLE_MAPS_API_ENDPOINT: 'https://maps.googleapis.com/maps/api',

  // Messages
  CANCEL_MESSAGE: "Cancelled.",
  ERROR_MESSAGE: `${ask.sayAsSpeechMarkup('Uh oh', 'interjection')}, something went wrong.`,
  HELP_MESSAGE: "You can ask, track my shipments or where's my stuff? Now, what can I help you with?",
  STOP_MESSAGE: "Goodbye!",
  UNHANDLED_MESSAGE: "Sorry, I didn't get that.",
  WELCOME_MESSAGE: "Welcome to Aftership.",

  AFTERSHIP_API_KEY_MISSING: "The Aftership API key is not configured. Please check the lambda function settings.",
  DEVICE_LOCATION_NOT_FOUND: "The device location couldn't be determined. Please check the lambda function logs.",
  DEVICE_PERM_NOT_GRANTED: "The device country and postal code permission haven't been granted. Please check the skill settings.",
  TIMESTAMP_DEFAULT_TIMEZONE: "All timestamps are defaulted to {default_timezone} timezone."
});
