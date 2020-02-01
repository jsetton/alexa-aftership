'use strict';

const config = require('./config.js');
const device = require('./device.js');
const location = require('./location.js');
const moment = require('./moment.js');
const { formatSpeechMarkup, sayAsSpeechMarkup } = require('./utils');

/**
 * AfterShip tracking status
 *    https://docs.aftership.com/api/4/delivery-status
 * @type {Object}
 */
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

/**
 * Defines AfterShip client class
 */
class AftershipClient {
  /**
   * Constructor
   */
  constructor() {
    // Initialize AfterShip API
    this.api = require('aftership')(config.AFTERSHIP_API_KEY);
  }

  /**
   * Returns courier names
   * @return {Object}
   */
  async getCourierNames() {
    try {
      const { data } = await this.api.call('GET', '/couriers/all');
      return data.couriers.reduce(
        (list, courier) => Object.assign(list, {[courier.slug]: courier.name}), {});
    } catch (error) {
      console.error('Failed to get couriers data:', JSON.stringify(error));
      throw error;
    };
  }

  /**
   * Returns trackings query
   * @param  {String} keyword
   * @param  {Object} couriers
   * @return {Object}
   */
  getTrackingsQuery(keyword, couriers) {
    // Delete keyword prepositions if string type
    keyword = typeof keyword === 'string' ? keyword.replace(/^(?:from|for)\s+/i, '') : null;

    // Extract courier slugs from keyword
    const slugs = !keyword ? [] : Object.entries(couriers).reduce((slugs, [slug, name]) =>
      slugs.concat(name.toLowerCase() === keyword.toLowerCase() ? slug : []), []);

    // Convert keyword to CamelCase to determine if a tag tracking status
    const tag = keyword ? keyword.toLowerCase()
      .replace(/\s(.)/g, function($1) { return $1.toUpperCase(); })
      .replace(/\s/g, '')
      .replace(/^(.)/, function($1) { return $1.toUpperCase(); }) : '';

    // Set query object
    this.query = {
      string: keyword,
      options: Object.assign({
        created_at_min: moment().subtract(config.AFTERSHIP_DAYS_SEARCH, 'days').format(),
        fields: 'tracking_number,title,slug,tag,last_updated_at,expected_delivery,note,checkpoints'
        // tag: 'InfoReceived,InTransit,OutForDelivery,AttemptFail,Delivered',
      }, slugs.length > 0 ? {
        slug: slugs.join(',')
      } : tag in trackingStatus ? {
        tag: tag
      } : {
        keyword: keyword
      })
    };

    if (config.DEBUG_MODE)
      console.log('Aftership trackings query:', JSON.stringify(this.query.options));

    return this.query;
  }

  /**
   * Returns trackings information
   * @param  {String} keyword
   * @return {Array}
   */
  async getTrackingsInformation(keyword) {
    try {
      // Get courier names
      const couriers = await this.getCourierNames();
      // Generate AfterShip trackings query
      const query = this.getTrackingsQuery(keyword, couriers);
      // Get AfterShip trackings list
      const { data } = await this.api.call('GET', '/trackings', {
        query: query.options
      });
      // Response key mapping
      const keymap = {
        id: 'tracking_number', tag: 'tag', slug:'slug', courier: 'courier', title: 'title',
        date: 'delivery_date', location: 'delivery_location', lastUpdated: 'last_updated'
      };
      const regexp = new RegExp(config.AFTERSHIP_NOTE_TAGGING);
      const response = [];

      data.trackings.forEach((pkg) => {
        // Ignore tracking for note not matching tagging regexp if specified
        if (config.AFTERSHIP_NOTE_TAGGING && (!pkg.note || !pkg.note.match(regexp))) {
          return;
        }

        // Set courier name based on slug
        pkg.courier = couriers[pkg.slug];

        // Set last updated date
        pkg.last_updated = moment(pkg.last_updated_at).setTimezone(device.timezone);

        // Set delivery information if currently out for delivery or delivered, otherwise use expected as delivery date
        if (['OutForDelivery', 'Delivered'].indexOf(pkg.tag) > -1) {
          pkg.checkpoints.some((checkpoint) => {
            if (checkpoint.tag === pkg.tag) {
              // Delivery date
              if (checkpoint.checkpoint_time) {
                pkg.delivery_date = moment(checkpoint.checkpoint_time).setTimezone(device.timezone);
              }

              // Delivery location
              const location = [];
              ['city', 'state', 'country_name', 'zip'].forEach((item) => {
                if (checkpoint[item]) {
                  location.push(checkpoint[item]);
                }
              });
              if (location.length > 0) {
                pkg.delivery_location = location.join(', ');
              }

              return true;
            }
          });
        } else if (pkg.expected_delivery) {
          pkg.delivery_date = moment(pkg.expected_delivery).setTimezone(device.timezone);
        }

        // Ignore tracking for delivered packages older than defined day.
        if (pkg.tag === 'Delivered' && (
          (
            pkg.delivery_date instanceof moment &&
            pkg.delivery_date.daysToToday() > config.AFTERSHIP_DAYS_PAST_DELIVERED
          ) || (
            pkg.last_updated instanceof moment &&
            pkg.last_updated.daysToToday() > config.AFTERSHIP_DAYS_PAST_DELIVERED
          )
        )) {
          return;
        }

        // Increase count if determined as multi-package otherwise add new entry
        response.some((item) => {
          const multiPackage = Object.keys(item).every((key) => {
            if (key === 'count') {
              return true;
            } else if (key === 'tag') {
              const tag = ['AttemptFail', 'Exception', 'Delivered', 'OutForDelivery'];
              return tag.indexOf(item.tag) === tag.indexOf(pkg[keymap.tag]);
            } else if (typeof item[key] !== typeof pkg[keymap[key]]) {
              return false;
            } else if (item[key] instanceof moment) {
              return item[key].diff(pkg[keymap[key]], 'days') === 0;
            } else {
              return item[key] === pkg[keymap[key]];
            }
          });
          if (multiPackage) {
            item.count += 1;
            return true;
          }
        }) || response.push(Object.entries(keymap).reduce(
          (item, [key, map]) => Object.assign(item, {[key]: pkg[map]}), {count: 1}));
      });

      // Return the sorted configured count limit results
      return this.sortTrackingsInformation(response).slice(0, config.AFTERSHIP_TRACKING_COUNT_LIMIT);
    } catch (error) {
      console.error('Failed to get trackings data:', JSON.stringify(error));
      throw error;
    }
  }

  /**
   * Returns sorted trackings information
   * @param  {Object} trackings
   * @return {Object}
   */
  sortTrackingsInformation(trackings) {
    if (Array.isArray(trackings)) {
      // Sort response messages based on absolute time difference from now and tag order
      trackings.sort((a, b) => {
        const tagOrder = ['Delivered', 'AttemptFail', 'Exception', 'OutForDelivery'];

        if (!(a.date instanceof moment)) {
          return 1;
        }
        if (!(b.date instanceof moment)) {
          return -1;
        }
        if (Math.abs(a.date.daysFromToday()) < Math.abs(b.date.daysFromToday())) {
          return -1;
        }
        if (Math.abs(a.date.daysFromToday()) > Math.abs(b.date.daysFromToday())) {
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
  }

  /**
   * Returns formatted trackings address
   * @param  {Object} trackings
   * @return {Object}
   */
  async getTrackingsAddress(trackings) {
    const geodata = await Promise.all(
      trackings.reduce((promises, tracking) =>
        promises.concat(tracking.location ? location.getGeoLocation(tracking.location, true) : undefined), [])
    );

    geodata.forEach((address, index) => {
      if (address) {
        // Determine if address & device location are the same
        if (Object.keys(address).every((key) => {
          return ['lat', 'lng'].indexOf(key) === -1 ? address[key] === device.location[key] : true;
        })) {
          trackings[index].address = 'here';
        } else if (!address.country || address.country === config.DEFAULT_COUNTRY) {
          trackings[index].address = address.city ? address.state ?
            `${address.city}, ${address.state}` : address.city : '';
        } else {
          trackings[index].address = address.city ? `${address.city}, ${address.country}` : address.country;
        }
      }
    });

    return trackings;
  }

  /**
   * Returns speech output formatted trackings list
   * @param  {Object} trackings
   * @param  {Array}  footnotes
   * @return {String}
   */
  async getTrackingsSpeechOutput(trackings, footnotes) {
    const query = this.query;
    const summary = {};
    // Update trackings with address location
    await this.getTrackingsAddress(trackings);
    // Iterate over trackings
    trackings.forEach((pkg) => {
      // Populate summary table
      const tag = ['AttemptFail', 'Exception', 'Delivered', 'OutForDelivery']
        .indexOf(pkg.tag) > -1 ? pkg.tag : 'ExpectedDelivery';
      summary[tag] = (summary[tag] || 0) + pkg.count;

      // Set response message
      const message = [
        pkg.count === 1 ? 'A' : sayAsSpeechMarkup(pkg.count, 'cardinal'),
        pkg.courier || pkg.slug,
        pkg.count === 1 ? 'package' : 'packages', 'from',
        formatSpeechMarkup(pkg.title)
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
            pkg.count === 1 ? 'is' : 'are', trackingStatus['Exception'],
            pkg.date ? `as of ${pkg.date.calendar()}` : ''
          );
          break;
        case 'Delivered':
          message.push(
            pkg.count === 1 ? 'was' : 'were',
            pkg.lastUpdated && !pkg.date ? 'marked as' : '', trackingStatus['Delivered'],
            pkg.address ? pkg.address != 'here' ? 'in ' + sayAsSpeechMarkup(pkg.address, 'address') : 'here' : '',
            pkg.date ? pkg.date.calendar() : pkg.lastUpdated ? pkg.lastUpdated.calendar() : '',
            pkg.date ? `at ${pkg.date.format('LT')}` : ''
          );
          break;
        case 'OutForDelivery':
          message.push(
            pkg.count === 1 ? 'is' : 'are', trackingStatus['OutForDelivery'],
            pkg.address ? pkg.address != 'here' ? 'in ' + sayAsSpeechMarkup(pkg.address, 'address') : 'towards here' : '',
            pkg.date ? `since ${pkg.date.format('LT')}` : ''
          );
          break;
        default:
          message.push(
            pkg.date ? trackingStatus['Expected' + (
              pkg.date.daysFromToday() >= 0 ? 'Present' : 'Past'
            )] + ' ' + pkg.date.calendar() : (pkg.count === 1 ? 'is ' : 'are ') + trackingStatus[pkg.tag]
          );
          break;
      }
      // Remove empty string words from message array
      pkg.message = message.filter(word => word !== '');
    });

    const response = {
      summary: 'Currently, you have '.concat(
        Object.keys(summary).reduce((result, status, idx, obj) => result.concat(
          idx > 0 ? idx != obj.length - 1 ? ', ' : ', and ' : '',
          summary[status], summary[status] > 1 ? ' packages ' : ' package ', trackingStatus[status]
        ), '') || (query.options.tag ? `no package ${trackingStatus[query.options.tag]}` : 'no package'),
        query.options.keyword || query.options.slug ? ` from ${query.string}` : '',
        Object.keys(summary).length > 0 ? ':' : '.'
      ),
      details: trackings.map(pkg => `${pkg.message.join(' ')}.`)
    };

    return '<p>' + (
      response.details.length > 1 ? response.summary + '</p>\n<p>' + response.details.join('\n') :
        response.details.length === 1 ? response.details[0] : response.summary
    ) + '</p>' + (
      Array.isArray(footnotes) && footnotes.length > 0 ?
        '\n<break time="1s"/>\n<p>' + footnotes.join('\n') + '</p>' : ''
    );
  }

  /**
   * Returns proactive events trackings list
   * @param  {Object} trackings
   * @param  {Number} interval
   * @return {Array}
   */
  getTrackingsProactiveEvents(trackings, interval) {
    const events = [];
    // Define now based on device timezone
    const now = moment().tz(device.timezone);
    // Define proactive event supported status
    const status = {'Delivered': 'ORDER_DELIVERED', 'OutForDelivery': 'ORDER_OUT_FOR_DELIVERY'};
    // Iterate over trackings with last updated date within schedule rate period and suppoerted status
    trackings
      .filter(pkg => now.diff(pkg.lastUpdated, 'minutes') < interval && pkg.tag in status)
      .forEach((pkg) => {
        events.push({
          timestamp: pkg.lastUpdated.toISOString(),
          referenceId: pkg.id,
          expiryTime: now.endOf('day').toISOString(),
          event: {
            name: 'AMAZON.OrderStatus.Updated',
            payload: {
              state: Object.assign({
                status: status[pkg.tag]
              }, pkg.date && pkg.tag === 'Delivered' && {
                deliveredOn: pkg.date.toISOString()
              }),
              order: {
                seller: {
                  name: 'localizedattribute:sellerName'
                }
              }
            }
          },
          localizedAttributes: [
            {
              locale: 'en-US',
              sellerName: pkg.title
            }
          ],
        })
      });

    return events;
  }
}

/**
 * Return trackings proactive events list
 * @param  {Number} interval
 * @return {Promise}
 */
async function getProactiveEvents(interval) {
  try {
    // Initialize AfterShip client
    const client = new AftershipClient();
    // Get trackings information
    const trackings = await client.getTrackingsInformation();
    // Return trackings proactive events
    return client.getTrackingsProactiveEvents(trackings, interval);
  } catch (error) {
    // Catch all errors
    throw error;
  }
}

/**
 * Returns trackings speech output
 * @param  {String} keyword
 * @param  {Array}  footnotes
 * @return {Promise}
 */
async function getSpeechOutput(keyword, footnotes) {
  try {
    // Initialize AfterShip client
    const client = new AftershipClient();
    // Get trackings information
    const trackings = await client.getTrackingsInformation(keyword);
    // Return trackings speech output
    return client.getTrackingsSpeechOutput(trackings, footnotes);
  } catch (error) {
    // Catch all errors
    throw error;
  }
};

module.exports = {
  getProactiveEvents,
  getSpeechOutput
};
