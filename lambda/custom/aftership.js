'use strict';

const config = require('./config');
const aftership = require('aftership')(config.AFTERSHIP_API_KEY);
const ask = require('./helpers').ask;
const device = require('./device');
const location = require('./location');
const moment = require('./moment');

// AfterShip tracking status
// https://docs.aftership.com/api/4/delivery-status
const trackingStatus = {
  InfoReceived: 'waiting to be received by the carrier',
  InTransit: 'in transit',
  OutForDelivery: 'out for delivery',
  AttemptFail: 'failed to be delivered by the carrier',
  Delivered: 'delivered',
  Exception: 'undelivered, returned to sender, or in custom hold',
  Pending: 'pending tracking information being available',
  // Not relevant to AfterShip API
  ExpectedDelivery: 'on the way',
  ExpectedPresent: 'should arrive',
  ExpectedPast: 'should have arrived'
};

// Format trackings address
function formatTrackingsAddress(trackings) {
  return Promise.all(
    trackings.reduce((acc, cur) => {
      acc.push(cur.location ? location.getGeoLocation(cur.location, true) : null);
      return acc;
    }, [])
  ).then((geodata) => {
    geodata.forEach((address, index) => {
      if (address) {
        // Determine if address & device location are the same
        if (Object.keys(address).every((key) => {
          return ['lat', 'lng'].indexOf(key) == -1 ? address[key] == device.location[key] : true;
        })) {
          trackings[index].address = 'here';
        } else if (!address.country || address.country == config.DEFAULT_COUNTRY) {
          trackings[index].address = address.city ? address.state ?
            `${address.city}, ${address.state}` : address.city : '';
        } else {
          trackings[index].address = address.city ? `${address.city}, ${address.country}` : address.country;
        }
      }
    })

    return trackings;
  });
};

// Format trackings list
function formatTrackingsList(trackings, couriers, query, footnotes) {
  let summary = {};

  trackings.forEach((pkg) => {
    // Populate summary table
    let tag = ['AttemptFail', 'Exception', 'Delivered', 'OutForDelivery']
      .indexOf(pkg.tag) > -1 ? pkg.tag : 'ExpectedDelivery';
    summary[tag] = (summary[tag] || 0) + pkg.count;

    // Set response message
    let message = [
      pkg.count == 1 ? 'A' : ask.sayAsSpeechMarkup(pkg.count, 'cardinal'),
      couriers[pkg.slug] || pkg.slug,
      pkg.count == 1 ? 'package' : 'packages', 'from',
      ask.formatSpeechMarkup(pkg.title)
    ];
    switch (pkg.tag) {
      case 'AttemptFail':
        message.push(
          trackingStatus['AttemptFail'],
          pkg.date ? pkg.date.calendar() : ''
        );
        break;
      case 'Exception':
        message.push(
          pkg.count == 1 ? 'is' : 'are', trackingStatus['Exception'],
          pkg.date ? `as of ${pkg.date.calendar()}` : ''
        );
        break;
      case 'Delivered':
        message.push(
          pkg.count == 1 ? 'was' : 'were',
          pkg.last_updated && !pkg.date ? 'marked as' : '', trackingStatus['Delivered'],
          pkg.address ? pkg.address != 'here' ? 'in ' + ask.sayAsSpeechMarkup(pkg.address, 'address') : 'here' : '',
          pkg.date ? pkg.date.calendar() : pkg.last_updated ? pkg.last_updated.calendar() : '',
          pkg.time ? `at ${pkg.time}` : ''
        );
        break;
      case 'OutForDelivery':
        message.push(
          pkg.count == 1 ? 'is' : 'are', trackingStatus['OutForDelivery'],
          pkg.address ? pkg.address != 'here' ? 'in ' + ask.sayAsSpeechMarkup(pkg.address, 'address') : 'towards here' : '',
          pkg.time ? `since ${pkg.time}` : ''
        );
        break;
      default:
        message.push(
          pkg.date ? trackingStatus['Expected' + (pkg.date.diff(device.today, 'days') >= 0 ? 'Present' : 'Past')] +
            ' ' + pkg.date.calendar() : (pkg.count == 1 ? 'is ' : 'are ') + trackingStatus[pkg.tag]
        );
        break;
    }
    // Remove empty string words from message array
    pkg.message = message.filter(word => word !== '');
  });

  let response = {
    summary: 'Currently, you have '.concat(
      Object.keys(summary).reduce((acc, cur, idx, obj) => {
        return acc.concat(
          idx > 0 ? idx != obj.length - 1 ? ', ' : ', and ' : '',
          summary[cur], summary[cur] > 1 ? ' packages ' : ' package ', trackingStatus[cur]
        );
      }, '') || (query.options.tag ? `no package ${trackingStatus[query.options.tag]}` : 'no package'),
      query.options.keyword || query.options.slug ? ` from ${query.string}` : '',
      Object.keys(summary).length > 0 ? ':' : '.'
    ),
    details: trackings.reduce((acc, cur) => {
      acc.push(cur.message.join(' ') + '.');
      return acc;
    }, [])
  };

  return '<p>' + (
    response.details.length > 1 ? response.summary + '</p>\n<p>' + response.details.join('\n') :
      response.details.length == 1 ? response.details[0] : response.summary
  ) + '</p>' + (
    Array.isArray(footnotes) && footnotes.length > 0 ?
      '\n<break time="1s"/>\n<p>' + footnotes.join('\n') + '</p>' : ''
  );
};

// Format trackings query
function formatTrackingsQuery(keyword, couriers) {
  // Delete keyword prepositions if string type
  keyword = keyword ? keyword.replace(/^(?:from|for)\s+/i, '') : null;

  // Extract courier slugs from keyword
  let slug = keyword ? Object.keys(couriers).reduce((acc, cur) => {
    if (couriers[cur].toLowerCase() == keyword.toLowerCase()) {
      acc.push(cur);
    }
    return acc;
  }, []) : [];

  // Convert keyword to CamelCase to determine if a tag tracking status
  let tag = keyword ? keyword.toLowerCase()
    .replace(/\s(.)/g, function($1) { return $1.toUpperCase(); })
    .replace(/\s/g, '')
    .replace(/^(.)/, function($1) { return $1.toUpperCase(); }) : '';

  // Set query object
  let query = {
    string: keyword,
    options: Object.assign({
      created_at_min: moment().subtract(config.AFTERSHIP_DAYS_SEARCH, 'days').format(),
      fields: 'title,slug,tag,updated_at,expected_delivery,note,checkpoints'
      // tag: 'InfoReceived,InTransit,OutForDelivery,AttemptFail,Delivered',
      },
      slug.length > 0 ? {slug: slug.join(',')} : tag in trackingStatus ? {tag: tag} : {keyword: keyword}
    )
  };

  if (config.DEBUG_MODE)
    console.log('Aftership trackings query:', JSON.stringify(query.options, null, 2));

  return query;
};

// Get courier name list
function getCourierNameList() {
  return aftership.call('GET', '/couriers/all').then(
    (result) => {
      return result.data.couriers.reduce((acc, cur) => {
        acc[cur.slug] = cur.name;
        return acc;
      }, {});
    },
    (error) => {
      console.error('Failed to get couriers data:', JSON.stringify(error, null, 2));
      throw error;
    }
  );
};

// Get trackings information
function getTrackingsInformation(query) {
  return aftership.call('GET', '/trackings', {
    query: query.options
  }).then(
    (result) => {
      // Response key mapping
      let keymap = {
        tag: 'tag', slug:'slug', title: 'title', date: 'delivery_date', time: 'delivery_time',
        location: 'delivery_location', last_updated: 'last_updated'
      };
      let regexp = new RegExp(config.AFTERSHIP_NOTE_TAGGING);
      let response = [];

      result.data.trackings.forEach((pkg) => {
        // Ignore tracking for note not matching tagging regexp if specified
        if (config.AFTERSHIP_NOTE_TAGGING && (!pkg.note || !pkg.note.match(regexp))) {
          return;
        }

        // Set delivery information if currently out for delivery or delivered, otherwise use expected as delivery date
        if (['OutForDelivery', 'Delivered'].indexOf(pkg.tag) > -1) {
          pkg.checkpoints.some((checkpoint) => {
            if (checkpoint.tag == pkg.tag) {
              // Delivery date and time
              if (checkpoint.checkpoint_time) {
                pkg.delivery_date = moment(checkpoint.checkpoint_time).setTimezone(device.timezone).startOf('day');
                pkg.delivery_time = moment(checkpoint.checkpoint_time).setTimezone(device.timezone).format('LT');
              }

              // Delivery location
              let location = [];
              ['city', 'state', 'country_name', 'zip'].forEach((item) => {
                if (checkpoint[item]) {
                  location.push(checkpoint[item]);
                }
              });
              if (location.length) {
                pkg.delivery_location = location.join(', ');
              }

              return true;
            }
          });
        } else if (pkg.expected_delivery) {
          pkg.delivery_date = moment(pkg.expected_delivery).setTimezone(device.timezone).startOf('day')
        }

        // Set last updated date if delivery date not defined
        if (!pkg.delivery_date && pkg.updated_at) {
          pkg.last_updated = moment(pkg.updated_at).setTimezone(device.timezone).startOf('day');
        }

        // Ignore tracking for delivered packages older than defined day.
        if (pkg.tag == 'Delivered' && (
          (
            pkg.delivery_date instanceof moment &&
            pkg.delivery_date.diff(device.today, 'days') < -config.AFTERSHIP_DAYS_PAST_DELIVERED
          ) || (
            pkg.last_updated instanceof moment &&
            pkg.last_updated.diff(device.today, 'days') < -config.AFTERSHIP_DAYS_PAST_DELIVERED
          )
        )) {
          return;
        }

        // Increase count if determined as multi-package otherwise add new entry
        response.some((item) => {
          let multiPackage = Object.keys(item).every((key) => {
            if (key == 'count') {
              return true;
            } else if (key == 'tag') {
              let tag = ['AttemptFail', 'Exception', 'Delivered', 'OutForDelivery'];
              return tag.indexOf(item.tag) == tag.indexOf(pkg[keymap.tag]);
            } else if (typeof item[key] !== typeof pkg[keymap[key]]) {
              return false;
            } else if (item[key] instanceof moment) {
              return item[key].diff(pkg[keymap[key]], 'days') == 0;
            } else {
              return item[key] === pkg[keymap[key]];
            }
          });
          if (multiPackage) {
            item.count += 1;
            return true;
          }
        }) || response.push({
          tag: pkg[keymap.tag],
          slug: pkg[keymap.slug],
          title: pkg[keymap.title],
          date: pkg[keymap.date],
          time: pkg[keymap.time],
          location: pkg[keymap.location],
          last_updated: pkg[keymap.last_updated],
          count: 1
        });
      });

      // Return the sorted configured count limit results
      return sortTrackingsInformation(response).slice(0, config.AFTERSHIP_TRACKING_COUNT_LIMIT);
    },
    (error) => {
      console.error('Failed to get trackings data:', JSON.stringify(error, null, 2));
      throw error;
    }
  );
};

// Sort trackings information
function sortTrackingsInformation(trackings) {
  if (Array.isArray(trackings)) {
    // Sort response messages based on absolute time difference from today and tag order
    trackings.sort((a, b) => {
      let tagOrder = ['Delivered', 'AttemptFail', 'Exception', 'OutForDelivery'];

      if (!(a.date instanceof moment)) {
        return 1;
      }
      if (!(b.date instanceof moment)) {
        return -1;
      }
      if (Math.abs(a.date.diff(device.today, 'days')) < Math.abs(b.date.diff(device.today, 'days'))) {
        return -1;
      }
      if (Math.abs(a.date.diff(device.today, 'days')) > Math.abs(b.date.diff(device.today, 'days'))) {
        return 1;
      }
      if (tagOrder.indexOf(a.tag) < tagOrder.indexOf(b.tag)) {
        return 1;
      }
      if (tagOrder.indexOf(a.tag) > tagOrder.indexOf(b.tag)) {
        return -1;
      }
      return 0;
    });
  }

  return trackings;
};

// Generate trackings list
function generateTrackingsList(keyword, footnotes) {
  let couriers, query;

  // Get AfterShip couriers list
  return getCourierNameList()
  // Generate AfterShip trackings query
  .then((result) => { couriers = result; return formatTrackingsQuery(keyword, couriers); })
  // Get trackings information
  .then((result) => { query = result; return getTrackingsInformation(query); })
  // Format trackings location address
  .then((trackings) => formatTrackingsAddress(trackings))
  // Format trackings output
  .then((trackings) => formatTrackingsList(trackings, couriers, query, footnotes))
  // Catch all errors
  .catch((error) => { throw error; });
};

module.exports = {
  generateTrackingsList: generateTrackingsList
};
