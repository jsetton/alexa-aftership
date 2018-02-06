'use strict';

// Ask helpers functions

const supportedSayAs = [
  'characters', 'spell-out',
  'cardinal', 'number',
  'ordinal', 'digits',
  'fraction', 'unit',
  'date', 'time',
  'telephone', 'address',
  'interjection', 'expletive'
];

function decodeSpeechMarkup(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
};

function encodeSpeechMarkup(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

function formatSpeechMarkup(text) {
  return encodeSpeechMarkup(text)
    .replace(
      /\b(\d+)\b/g,
      sayAsSpeechMarkup('$1', 'cardinal')
    ).replace(
      /\b(\d*?)[+\s]*(\d+\/\d+)\b/,
      sayAsSpeechMarkup('$1' ? '$1+$2' : '$2', 'fraction')
    ).replace(
      /\b\d+\s*([cmk]?[glm]|(?:sq)?ft|in|mi|yd|lb[s]?|oz|gal|qt|pt|h|min|[m]?s)\b/,
      sayAsSpeechMarkup('$1', 'unit')
    );
};

function sayAsSpeechMarkup(text, interpretAs) {
  return supportedSayAs.indexOf(interpretAs) > -1 ? `<say-as interpret-as="${interpretAs}">${text}</say-as>` : text;
};

function stripSpeechMarkup(text) {
  return decodeSpeechMarkup(text.replace(/<[^>]+>/g, ''));
};

module.exports = {
    ask: {
      formatSpeechMarkup: formatSpeechMarkup,
      sayAsSpeechMarkup: sayAsSpeechMarkup,
      stripSpeechMarkup: stripSpeechMarkup
    }
};
