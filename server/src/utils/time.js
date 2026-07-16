/**
 * Time-of-day helpers.
 *
 * Every judgement about WHEN something happened to a patient must be made in
 * the patient's own timezone. The server's clock is an accident of hosting.
 */

const DEFAULT_TZ = 'Asia/Kolkata';

/**
 * The hour (0-23) at `date`, as read on a clock in `timezone`.
 *
 * Note 'en-GB' + hourCycle 'h23' — NOT 'en-US' + hour12:false, which is a
 * well-known footgun that returns "24" for midnight instead of "00".
 */
const hourIn = (timezone = DEFAULT_TZ, date = new Date()) => {
  try {
    return Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        hour: '2-digit',
        hourCycle: 'h23',
      }).format(date)
    );
  } catch {
    // an unknown timezone string shouldn't break answering a question
    return date.getUTCHours();
  }
};

module.exports = { hourIn, DEFAULT_TZ };