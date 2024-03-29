import { AfterShip } from 'aftership';
import device from './device.js';
import { getGeoLocation } from './location.js';
import moment from './moment.js';
import { formatSpeechMarkup, sayAsSpeechMarkup } from './utils.js';

/**
 * AfterShip tracking status
 *    https://docs.aftership.com/api/4/delivery-status
 * @type {Object}
 */
const TRACKING_STATUS = {
  InfoReceived: 'waiting to be received by the carrier',
  InTransit: 'in transit',
  AvailableForPickup: 'available for pickup',
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
    this.api = new AfterShip(process.env.AFTERSHIP_API_KEY);
  }

  /**
   * Returns courier names
   * @return {Object}
   */
  async getCourierNames() {
    try {
      const { couriers } = await this.api.courier.listAllCouriers();
      return couriers.reduce((list, courier) => ({ ...list, [courier.slug]: courier.name }), {});
    } catch (error) {
      console.error('Failed to get couriers data:', error);
      throw error;
    }
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

    // Determine slug parameter from keyword
    const slug = keyword
      ? Object.keys(couriers)
          .filter((slug) => couriers[slug].toLowerCase() === keyword.toLowerCase())
          .join(',')
      : null;

    // Determine tag parameter from keyword
    const tag = keyword
      ? Object.keys(TRACKING_STATUS).find((tag) => TRACKING_STATUS[tag].startsWith(keyword.toLowerCase()))
      : null;

    // Set query object
    this.query = {
      string: keyword,
      parameters: {
        created_at_min: moment().subtract(process.env.AFTERSHIP_DAYS_SEARCH, 'days').format(),
        fields: 'tracking_number,title,slug,tag,last_updated_at,expected_delivery,note,checkpoints',
        // tag: 'InfoReceived,InTransit,AvailableForPickup,OutForDelivery,AttemptFail,Delivered',
        ...((slug && { slug }) || (tag && { tag }) || (keyword && { keyword }))
      }
    };

    if (process.env.DEBUG_MODE === 'true')
      console.log('Aftership trackings query:', JSON.stringify(this.query.parameters));

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
      const { trackings } = await this.api.tracking.listTrackings(query.parameters);
      const regexp = new RegExp(process.env.AFTERSHIP_NOTE_TAGGING);
      const response = [];

      trackings.forEach((pkg) => {
        // Ignore tracking for note not matching tagging regexp
        if (!regexp.test(pkg.note)) {
          return;
        }

        // Set courier name based on slug
        pkg.courier = couriers[pkg.slug];

        // Set last updated date
        pkg.last_updated = moment(pkg.last_updated_at).setTimezone(device.timezone);

        // Set tag event number based on checkpoints tag and unique created_at parameters
        pkg.tag_event_number = pkg.checkpoints.filter(
          (checkpoint, index, array) =>
            checkpoint.tag === pkg.tag && array.findIndex((item) => item.created_at === checkpoint.created_at) === index
        ).length;

        // Set delivery information if currently available for pickup, out for delivery or delivered,
        //  otherwise use expected as delivery date
        if (['AvailableForPickup', 'OutForDelivery', 'Delivered'].includes(pkg.tag)) {
          // Find latest checkpoint tag event
          const checkpoint = pkg.checkpoints
            .slice()
            .reverse()
            .find((checkpoint) => checkpoint.tag === pkg.tag);

          if (checkpoint) {
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
          }
        } else if (pkg.expected_delivery) {
          pkg.delivery_date = moment(pkg.expected_delivery).setTimezone(device.timezone);
        }

        // Ignore tracking for delivered packages older than defined day.
        if (
          pkg.tag === 'Delivered' &&
          ((pkg.delivery_date instanceof moment &&
            pkg.delivery_date.daysToToday() > process.env.AFTERSHIP_DAYS_PAST_DELIVERED) ||
            (pkg.last_updated instanceof moment &&
              pkg.last_updated.daysToToday() > process.env.AFTERSHIP_DAYS_PAST_DELIVERED))
        ) {
          return;
        }

        // Response key mapping
        const keymap = {
          tag: 'tag',
          slug: 'slug',
          courier: 'courier',
          title: 'title',
          date: 'delivery_date',
          location: 'delivery_location',
          lastUpdated: 'last_updated',
          tagEventNumber: 'tag_event_number'
        };
        // Determine if package part of multi-package
        const multiPkg = response.find((item) =>
          Object.entries(keymap).every(([key, attr]) => {
            if (key === 'lastUpdated' || key === 'tagEventNumber') {
              return true;
            } else if (key === 'tag') {
              const tag = ['AttemptFail', 'AvailableForPickup', 'Exception', 'Delivered', 'OutForDelivery'];
              return tag.indexOf(item[key]) === tag.indexOf(pkg[attr]);
            } else if (typeof item[key] !== typeof pkg[attr]) {
              return false;
            } else if (item[key] instanceof moment) {
              return item[key].diff(pkg[attr], 'hours') === 0;
            } else {
              return item[key] === pkg[attr];
            }
          })
        );

        // Update multi-package if found, otherwise add new entry
        if (typeof multiPkg !== 'undefined') {
          multiPkg.count += 1;
          multiPkg.trackingIds.push(pkg.tracking_number);
        } else {
          response.push(
            Object.entries(keymap).reduce((item, [key, attr]) => ({ ...item, [key]: pkg[attr] }), {
              count: 1,
              trackingIds: [pkg.tracking_number]
            })
          );
        }
      });

      // Return the sorted configured count limit results
      return this.sortTrackingsInformation(response).slice(0, process.env.AFTERSHIP_TRACKING_COUNT_LIMIT);
    } catch (error) {
      console.error('Failed to get trackings data:', error);
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
        const tagOrder = ['Delivered', 'AttemptFail', 'Exception', 'OutForDelivery', 'AvailableForPickup'];

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
      trackings.map((tracking) => tracking.location && getGeoLocation(tracking.location, true))
    );

    geodata.forEach((address, index) => {
      if (address) {
        // Determine if address is the device location
        if (
          Object.keys(address)
            .filter((key) => key !== 'lat' && key !== 'lng')
            .every((key) => address[key] === device.location[key])
        ) {
          trackings[index].address = 'here';
        } else if (!address.country || address.country === process.env.DEFAULT_COUNTRY) {
          trackings[index].address = address.city
            ? address.state
              ? `${address.city}, ${address.state}`
              : address.city
            : '';
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
      const tag = ['AttemptFail', 'AvailableForPickup', 'Exception', 'Delivered', 'OutForDelivery'].includes(pkg.tag)
        ? pkg.tag
        : 'ExpectedDelivery';
      summary[tag] = (summary[tag] || 0) + pkg.count;

      // Set response message
      const message = [
        pkg.count === 1 ? 'A' : sayAsSpeechMarkup(pkg.count, 'cardinal'),
        pkg.courier || pkg.slug,
        pkg.count === 1 ? 'package' : 'packages',
        'from',
        formatSpeechMarkup(pkg.title)
      ];
      switch (pkg.tag) {
        case 'AttemptFail':
          message.push(TRACKING_STATUS.AttemptFail, pkg.date ? pkg.date.calendar() : '');
          break;
        case 'Exception':
          message.push(
            pkg.count === 1 ? 'is' : 'are',
            TRACKING_STATUS.Exception,
            pkg.date ? `as of ${pkg.date.calendar()}` : ''
          );
          break;
        case 'Delivered':
          message.push(
            pkg.count === 1 ? 'was' : 'were',
            pkg.lastUpdated && !pkg.date ? 'marked as' : '',
            TRACKING_STATUS.Delivered,
            pkg.address ? (pkg.address !== 'here' ? 'in ' + sayAsSpeechMarkup(pkg.address, 'address') : 'here') : '',
            pkg.date ? pkg.date.calendar() : pkg.lastUpdated ? pkg.lastUpdated.calendar() : '',
            pkg.date ? `at ${pkg.date.format('LT')}` : ''
          );
          break;
        case 'OutForDelivery':
          message.push(
            pkg.count === 1 ? 'is' : 'are',
            TRACKING_STATUS.OutForDelivery,
            pkg.address
              ? pkg.address !== 'here'
                ? 'in ' + sayAsSpeechMarkup(pkg.address, 'address')
                : 'towards here'
              : '',
            pkg.date ? `since ${pkg.date.format('LT')}` : ''
          );
          break;
        case 'AvailableForPickup':
          message.push(
            pkg.count === 1 ? 'is' : 'are',
            TRACKING_STATUS.AvailableForPickup,
            pkg.address && pkg.address !== 'here' ? 'in ' + sayAsSpeechMarkup(pkg.address, 'address') : '',
            pkg.date ? `since ${pkg.date.format('LT')}` : ''
          );
          break;
        default:
          message.push(
            pkg.date
              ? (pkg.date.daysFromToday() >= 0 ? TRACKING_STATUS.ExpectedPresent : TRACKING_STATUS.ExpectedPast) +
                  ' ' +
                  pkg.date.calendar()
              : (pkg.count === 1 ? 'is ' : 'are ') + TRACKING_STATUS[pkg.tag]
          );
          break;
      }
      // Remove empty string words from message array
      pkg.message = message.filter((word) => word !== '');
    });

    const response = {
      summary: 'Currently, you have '.concat(
        Object.keys(summary).reduce(
          (result, status, idx, obj) =>
            result.concat(
              idx > 0 ? (idx !== obj.length - 1 ? ', ' : ', and ') : '',
              summary[status],
              summary[status] > 1 ? ' packages ' : ' package ',
              TRACKING_STATUS[status]
            ),
          ''
        ) || (query.parameters.tag ? `no package ${TRACKING_STATUS[query.parameters.tag]}` : 'no package'),
        query.parameters.keyword || query.parameters.slug ? ` from ${query.string}` : '',
        Object.keys(summary).length > 0 ? ':' : '.'
      ),
      details: trackings.map((pkg) => `${pkg.message.join(' ')}.`)
    };

    return (
      '<p>' +
      (response.details.length > 1
        ? response.summary + '</p>\n<p>' + response.details.join('\n')
        : response.details.length === 1
        ? response.details[0]
        : response.summary) +
      '</p>' +
      (Array.isArray(footnotes) && footnotes.length > 0
        ? '\n<break time="1s"/>\n<p>' + footnotes.join('\n') + '</p>'
        : '')
    );
  }

  /**
   * Returns proactive events trackings list
   * @param  {Object} trackings
   * @param  {String} lastEvent
   * @return {Array}
   */
  getTrackingsProactiveEvents(trackings, lastEvent) {
    const events = [];
    // Define current date based on device timezone
    const now = moment().tz(device.timezone);
    // Define proactive supported tracking events
    const trackingEvents = {
      InTransit: { status: 'ORDER_SHIPPED', all: false },
      OutForDelivery: { status: 'ORDER_OUT_FOR_DELIVERY', all: true },
      Delivered: { status: 'ORDER_DELIVERED', all: true }
    };
    // Iterate over trackings with last updated date after last event date,
    //  and supported tracking events & occurrence number
    trackings
      .filter(
        (pkg) =>
          pkg.lastUpdated.isAfter(lastEvent) &&
          pkg.tag in trackingEvents &&
          (trackingEvents[pkg.tag].all || pkg.tagEventNumber === 1)
      )
      .forEach((pkg) =>
        pkg.trackingIds.forEach((trackingId) => {
          events.push({
            timestamp: now.toISOString(),
            referenceId: trackingId,
            expiryTime: now.endOf('day').toISOString(),
            event: {
              name: 'AMAZON.OrderStatus.Updated',
              payload: {
                state: {
                  status: trackingEvents[pkg.tag].status,
                  enterTimeStamp: pkg.lastUpdated.toISOString(),
                  ...(pkg.date &&
                    trackingEvents[pkg.tag].status === 'ORDER_DELIVERED' && {
                      deliveredOn: pkg.date.toISOString()
                    }),
                  ...(pkg.date &&
                    trackingEvents[pkg.tag].status === 'ORDER_SHIPPED' && {
                      deliveryDetails: {
                        expectedArrival: pkg.date.endOf('day').toISOString()
                      }
                    })
                },
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
            ]
          });
        })
      );

    return events;
  }
}

/**
 * Return trackings proactive events list
 * @param  {String} lastEvent
 * @return {Promise}
 */
export const getProactiveEvents = async (lastEvent) => {
  try {
    // Initialize AfterShip client
    const client = new AftershipClient();
    // Get trackings information
    const trackings = await client.getTrackingsInformation();
    // Return trackings proactive events
    return client.getTrackingsProactiveEvents(trackings, lastEvent);
  } catch (error) {
    // Catch all errors
    throw error;
  }
};

/**
 * Returns trackings speech output
 * @param  {String} keyword
 * @param  {Array}  footnotes
 * @return {Promise}
 */
export const getSpeechOutput = async (keyword, footnotes) => {
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
