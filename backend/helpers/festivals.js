'use strict';

/** @type {Object} Indian festival calendar keyed as MM-DD */
const INDIAN_FESTIVALS = {
  '01-01': "New Year's Day",
  '01-14': 'Makar Sankranti / Pongal',
  '01-26': 'Republic Day',
  '02-14': "Valentine's Day",
  '03-08': 'International Women\'s Day',
  '03-25': 'Holi',
  '04-14': 'Baisakhi / Ambedkar Jayanti',
  '05-01': 'Labour Day',
  '05-12': "Mother's Day",
  '06-15': "Father's Day",
  '06-21': 'International Yoga Day',
  '06-27': 'World MSME Day',
  '07-04': 'Eid al-Adha',
  '08-15': 'Independence Day / Raksha Bandhan',
  '08-26': 'Janmashtami',
  '09-05': 'Teachers Day',
  '09-07': 'Onam',
  '10-02': 'Gandhi Jayanti',
  '10-12': 'Navratri begins',
  '10-16': 'World Food Day',
  '10-20': 'Dussehra',
  '10-31': 'Halloween',
  '11-01': 'Diwali',
  '11-14': "Children's Day",
  '11-15': 'Guru Nanak Jayanti',
  '11-28': 'Black Friday',
  '12-25': 'Christmas',
  '12-31': "New Year's Eve",
};

/**
 * Returns upcoming festivals within a rolling window.
 * @param {number} [windowDays=30]
 * @returns {{ name: string, date: string, daysAway: number }[]}
 */
function getNearbyFestivals(windowDays = 30) {
  const today = new Date();
  const results = [];

  for (let d = -1; d <= windowDays; d++) {
    const check = new Date(today);
    check.setDate(today.getDate() + d);
    const key =
      String(check.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(check.getDate()).padStart(2, '0');

    if (INDIAN_FESTIVALS[key]) {
      results.push({
        name: INDIAN_FESTIVALS[key],
        date: check.toISOString().split('T')[0],
        daysAway: d,
      });
    }
  }

  return results;
}

module.exports = { INDIAN_FESTIVALS, getNearbyFestivals };
