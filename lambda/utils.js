/**
 * List of supported say as interpret names
 * @type {Array}
 */
const supportedSayAs = [
  'characters',
  'spell-out',
  'cardinal',
  'number',
  'ordinal',
  'digits',
  'fraction',
  'unit',
  'date',
  'time',
  'telephone',
  'address',
  'interjection',
  'expletive'
];

/**
 * Returns decoded speech markup
 * @param  {String} text
 * @return {String}
 */
const decodeSpeechMarkup = (text) => {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
};

/**
 * Returns encoded speech markup
 * @param  {String} text
 * @return {String}
 */
const encodeSpeechMarkup = (text) => {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

/**
 * Returns formatted speech markup
 * @param  {String} text
 * @return {String}
 */
export const formatSpeechMarkup = (text) => {
  return encodeSpeechMarkup(text)
    .replace(/\b(\d+)\b/g, sayAsSpeechMarkup('$1', 'cardinal'))
    .replace(/\b(\d*?)[+\s]*(\d+\/\d+)\b/, sayAsSpeechMarkup('$1' ? '$1+$2' : '$2', 'fraction'))
    .replace(
      /\b\d+\s*([cmk]?[glm]|(?:sq)?ft|in|mi|yd|lb[s]?|oz|gal|qt|pt|h|min|[m]?s)\b/,
      sayAsSpeechMarkup('$1', 'unit')
    );
};

/**
 * Returns say as interpret speech markup tagging
 * @param  {String} text
 * @param  {String} interpretAs
 * @return {String}
 */
export const sayAsSpeechMarkup = (text, interpretAs) => {
  return supportedSayAs.includes(interpretAs) ? `<say-as interpret-as="${interpretAs}">${text}</say-as>` : text;
};

/**
 * Return stripped speech markup
 * @param  {String} text
 * @return {String}
 */
export const stripSpeechMarkup = (text) => {
  return decodeSpeechMarkup(text.replace(/<[^>]+>/g, ''));
};
