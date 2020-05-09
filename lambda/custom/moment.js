'use strict';

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

moment.prototype.countDays = function(date, type) {
  const dateA = this.clone().startOf('day');
  const dateB = date.clone().startOf('day');
  return type === 'from' ? dateA.diff(dateB, 'days') : dateB.diff(dateA, 'days');
}

moment.prototype.daysFromToday = function() {
  return this.countDays(moment().tz(this.tz()), 'from');
};

moment.prototype.daysToToday = function() {
  return this.countDays(moment().tz(this.tz()), 'to');
};

moment.prototype.setTimezone = function(timezone) {
  const input = this.creationData().input;
  // Check if input timestamp included timezone information
  if (typeof input !== 'string' || input.match(/(?:[+-]\d{2}[:]?\d{2}|Z)$/)) {
    return this.tz(timezone);
  } else {
    const local = this.clone().tz(timezone);
    return local.add(this.utcOffset() - local.utcOffset(), 'minutes');
  }
};

module.exports = moment;
