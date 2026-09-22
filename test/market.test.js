const test = require('node:test');
const assert = require('node:assert/strict');
const { session, nextOpen, duePosts, marketStatus } = require('../src/market');
const { buildStockEmbed } = require('../src/embed');

test('normal session has four evenly spaced reports and a delayed close pair', () => {
  const day = session('2026-09-22');
  assert.equal(day.open.toISOString(), '2026-09-22T13:30:00.000Z');
  assert.equal(day.close.toISOString(), '2026-09-22T20:00:00.000Z');
  assert.deepEqual(day.posts.map((post) => post.at.toISOString()), [
    '2026-09-22T13:30:00.000Z',
    '2026-09-22T15:08:00.000Z',
    '2026-09-22T16:45:00.000Z',
    '2026-09-22T18:23:00.000Z',
    '2026-09-22T20:15:00.000Z',
    '2026-09-22T20:15:00.000Z',
  ]);
  assert.equal(marketStatus(new Date('2026-09-22T20:00:00Z')), 'closed');
});

test('holidays, weekends, early closes and daylight saving time follow U.S. equity hours', () => {
  // Published NYSE holiday dates for 2026–2028, also matching FINRA's 2026 OTC schedule.
  const holidays = {
    2026: ['01-01', '01-19', '02-16', '04-03', '05-25', '06-19', '07-03', '09-07', '11-26', '12-25'],
    2027: ['01-01', '01-18', '02-15', '03-26', '05-31', '06-18', '07-05', '09-06', '11-25', '12-24'],
    2028: ['01-17', '02-21', '04-14', '05-29', '06-19', '07-04', '09-04', '11-23', '12-25'],
  };
  for (const [year, dates] of Object.entries(holidays)) {
    for (const date of dates) assert.equal(session(`${year}-${date}`), null, `${year}-${date}`);
  }
  assert.equal(session('2026-09-26'), null);
  assert.equal(session('2028-01-01'), null);
  assert.equal(session('2027-12-31').close.toISOString(), '2027-12-31T21:00:00.000Z');
  assert.equal(session('2026-11-27').close.toISOString(), '2026-11-27T18:00:00.000Z');
  assert.equal(session('2026-12-24').close.toISOString(), '2026-12-24T18:00:00.000Z');
  assert.equal(session('2028-07-03').close.toISOString(), '2028-07-03T17:00:00.000Z');
  assert.equal(session('2026-01-05').open.toISOString(), '2026-01-05T14:30:00.000Z');
  assert.equal(session('2026-07-06').open.toISOString(), '2026-07-06T13:30:00.000Z');
  assert.equal(nextOpen(new Date('2026-07-02T21:00:00Z')).toISOString(), '2026-07-06T13:30:00.000Z');
});

test('completed slots stay skipped after restart; missed slots do not backfill', () => {
  const open = new Date('2026-09-22T13:31:00Z');
  assert.deepEqual(duePosts(open, []).map((post) => post.id), ['regular-0']);
  assert.deepEqual(duePosts(open, ['regular-0']), []);
  assert.deepEqual(duePosts(new Date('2026-09-22T13:46:00Z'), []), []);
  const closing = new Date('2026-09-22T20:16:00Z');
  assert.deepEqual(duePosts(closing, ['regular-0', 'regular-1', 'regular-2', 'regular-3'])
    .map((post) => post.id), ['close-report', 'close-message']);
  assert.deepEqual(duePosts(closing, ['close-report']).map((post) => post.id), ['close-message']);
  assert.deepEqual(duePosts(closing, ['close-report', 'close-message']), []);
});

test('closing and manual snapshots identify the actual last trade time', () => {
  const quote = {
    name: 'Firan', symbol: 'FTGFF', exchange: 'OTCMKTS', currency: 'USD',
    price: 16, marketState: 'POST', quoteSourceName: 'Delayed Quote',
    regularMarketTime: '2026-09-22T18:16:48Z', fetchedAt: '2026-09-22T20:15:00Z',
    periods: {},
  };
  const config = {
    symbol: 'FTGFF', companyName: 'Firan', exchange: 'OTCMKTS',
    fields: { price: true }, includeChartHint: false,
  };
  for (const options of [{ kind: 'close' }, { manualClosed: true }]) {
    const description = buildStockEmbed(quote, config, options).toJSON().description;
    assert.match(description, /last reported price/i);
    assert.match(description, /Last regular trade: <t:1790101008:F>/);
    assert.doesNotMatch(description, /20:15|4:00 p\.m\./);
    const embed = buildStockEmbed(quote, config, options).toJSON();
    assert.equal(embed.timestamp, '2026-09-22T18:16:48.000Z');
    assert.match(embed.footer.text, /Delayed Quote/);
  }
});

test('intraday embed keeps essentials while close retains selected details', () => {
  const quote = {
    name: 'Firan', symbol: 'FTGFF', exchange: 'OTCMKTS', currency: 'USD',
    price: 15.49, open: 15.19, high: 15.49, low: 15.19, volume: 100,
    marketCap: 389970000, week52High: 19.09,
    marketState: 'REGULAR', quoteSourceName: 'Delayed Quote',
    fetchedAt: '2026-09-22T14:32:00Z',
    periods: {
      day: { change: 0.31, changePercent: 2.05 },
      sinceLastReport: { baseline: 15.49, change: 0, changePercent: 0 },
      month: { change: -1.01, changePercent: -6.11 },
    },
  };
  const config = {
    companyName: 'Firan', symbol: 'FTGFF', exchange: 'OTCMKTS',
    includeChartHint: true,
    fields: { price: true, change24h: true, changeSinceLast: true,
      open: true, high: true, low: true, volume: true, marketCap: true,
      week52High: true, changeMonth: true },
  };
  const intraday = buildStockEmbed(quote, config).toJSON();
  assert.match(intraday.description, /# 15\.49 USD\n```ansi\nToday\s+\u001b\[1;32m▲ \+0\.31 \(\+2\.05%\)\u001b\[0m/);
  assert.match(intraday.description, /Since last post\s+\u001b\[2;37m• 0\.00 \(0\.00%\)\u001b\[0m/);
  assert.deepEqual(intraday.fields.map(({ name }) => name), ['Open', 'Day range', 'Volume']);
  assert.doesNotMatch(intraday.description, /Longer-term performance/);
  assert.equal(intraday.url, 'https://finance.yahoo.com/quote/FTGFF');
  const close = buildStockEmbed(quote, config, { kind: 'close', chartAttachmentName: 'chart.png' }).toJSON();
  assert.match(close.description, /1 month\s+\u001b\[1;31m▼ -1\.01 \(-6\.11%\)\u001b\[0m/);
  assert.ok(close.fields.some(({ name }) => name === 'Mkt Cap'));
  assert.equal(close.image.url, 'attachment://chart.png');
});
