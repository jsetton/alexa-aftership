'use strict';

const config = require('./config');
const moment = require('moment-timezone');

moment.updateLocale('en', {
  calendar: {
    sameDay: '[today]',
    nextDay: '[tomorrow]',
    nextWeek: '[on] dddd',
    lastDay: '[yesterday]',
    lastWeek: '[last] dddd',
    sameElse: '[on] dddd, MMMM Do'
  },
});

moment.prototype.setTimezone = function(timezone) {
  // Check if the timezone provided is valid otherwise set to default config value
  if (moment.tz.zone(timezone) === null) {
    timezone = config.DEFAULT_TIMEZONE;
  }
  // Check if input timestamp included timezone information
  if (this.creationData().input.match(/(?:[+-]\d{2}[:]?\d{2}|Z)$/)) {
    return this.tz(timezone);
  } else {
    let local = this.clone().tz(timezone);
    return local.add(this.utcOffset() - local.utcOffset(), 'minutes');
  }
};

module.exports = moment;
