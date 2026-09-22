const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const DAY_MS = 24 * 60 * 60 * 1000;

function formatNumber(value, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatMarketCap(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toLocaleString('en-US');
}

function formatVolume(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString('en-US');
}

function deltaFrom(current, baseline) {
  if (current == null || baseline == null || Number.isNaN(Number(current)) || Number.isNaN(Number(baseline))) {
    return { change: null, changePercent: null, baseline: null };
  }
  const c = Number(current);
  const b = Number(baseline);
  if (b === 0) {
    return { change: c - b, changePercent: null, baseline: b };
  }
  return {
    change: c - b,
    changePercent: ((c - b) / b) * 100,
    baseline: b,
  };
}

function barClose(bar) {
  if (!bar) return null;
  const value = bar.adjclose ?? bar.close ?? null;
  return value == null ? null : Number(value);
}

function barTime(bar) {
  return new Date(bar.date).getTime();
}

/** Closest daily close on or before target time. */
function findCloseAtOrBefore(quotes, targetMs) {
  if (!quotes?.length) return null;
  let best = null;
  for (const bar of quotes) {
    const t = barTime(bar);
    if (Number.isNaN(t) || t > targetMs) continue;
    if (!best || t > barTime(best)) best = bar;
  }
  return barClose(best);
}

async function fetchHistory(symbol) {
  const period1 = new Date(Date.now() - 400 * DAY_MS);
  const chart = await yahooFinance.chart(symbol, {
    period1,
    interval: '1d',
  });
  return (chart.quotes || []).filter((q) => barClose(q) != null);
}

function buildPeriodChanges(price, quotes, lastReportPrice) {
  const now = Date.now();

  // Prefer previous trading day's close for "24h" on thinly traded OTC names
  const close1d =
    quotes.length >= 2
      ? barClose(quotes[quotes.length - 2])
      : findCloseAtOrBefore(quotes, now - DAY_MS);
  const close1m = findCloseAtOrBefore(quotes, now - 30 * DAY_MS);
  const close1y = findCloseAtOrBefore(quotes, now - 365 * DAY_MS);

  return {
    sinceLastReport: deltaFrom(price, lastReportPrice),
    day: deltaFrom(price, close1d),
    month: deltaFrom(price, close1m),
    year: deltaFrom(price, close1y),
  };
}

async function fetchQuote(symbol = 'FTGFF', options = {}) {
  const { lastReportPrice = null } = options;

  const [quote, history] = await Promise.all([
    yahooFinance.quote(symbol),
    fetchHistory(symbol),
  ]);

  if (!quote) {
    throw new Error(`No quote data returned for ${symbol}`);
  }

  const price = quote.regularMarketPrice ?? quote.postMarketPrice ?? null;
  const previousClose = quote.regularMarketPreviousClose ?? null;
  const change =
    quote.regularMarketChange ??
    (price != null && previousClose != null ? price - previousClose : null);
  const changePercent =
    quote.regularMarketChangePercent ??
    (change != null && previousClose ? (change / previousClose) * 100 : null);

  const periods = buildPeriodChanges(price, history, lastReportPrice);

  // If chart 24h baseline is missing, fall back to session day change
  if (periods.day.change == null && change != null) {
    periods.day = {
      change,
      changePercent,
      baseline: previousClose,
    };
  }

  return {
    symbol: quote.symbol || symbol,
    name: quote.shortName || quote.longName || symbol,
    exchange: quote.fullExchangeName || quote.exchange || 'OTCMKTS',
    currency: quote.currency || 'USD',
    price,
    change,
    changePercent,
    open: quote.regularMarketOpen ?? null,
    high: quote.regularMarketDayHigh ?? null,
    low: quote.regularMarketDayLow ?? null,
    previousClose,
    volume: quote.regularMarketVolume ?? null,
    marketCap: quote.marketCap ?? null,
    peRatio: quote.trailingPE || quote.forwardPE || null,
    week52High: quote.fiftyTwoWeekHigh ?? null,
    week52Low: quote.fiftyTwoWeekLow ?? null,
    dividend: quote.dividendRate ?? quote.trailingAnnualDividendRate ?? null,
    marketState: quote.marketState || 'UNKNOWN',
    regularMarketTime: quote.regularMarketTime || null,
    quoteSourceName: quote.quoteSourceName || null,
    postMarketPrice: quote.postMarketPrice ?? null,
    postMarketChange: quote.postMarketChange ?? null,
    postMarketChangePercent: quote.postMarketChangePercent ?? null,
    periods,
    history: history.map((bar) => ({
      date: bar.date,
      close: barClose(bar),
    })),
    fetchedAt: new Date().toISOString(),
  };
}

function buildFieldRows(quote, fields) {
  const rows = [];
  const push = (key, name, value) => {
    if (fields[key]) rows.push({ name, value, inline: true });
  };

  push('open', 'Open', `${formatNumber(quote.open)} ${quote.currency}`);
  push('high', 'High', `${formatNumber(quote.high)} ${quote.currency}`);
  push('low', 'Low', `${formatNumber(quote.low)} ${quote.currency}`);
  push('previousClose', 'Prev Close', `${formatNumber(quote.previousClose)} ${quote.currency}`);
  push('volume', 'Volume', formatVolume(quote.volume));
  push('marketCap', 'Mkt Cap', formatMarketCap(quote.marketCap));
  push('peRatio', 'P/E Ratio', quote.peRatio != null ? formatNumber(quote.peRatio) : '—');
  push('week52High', '52W High', `${formatNumber(quote.week52High)} ${quote.currency}`);
  push('week52Low', '52W Low', `${formatNumber(quote.week52Low)} ${quote.currency}`);
  push('dividend', 'Dividend', quote.dividend ? formatNumber(quote.dividend) : '—');

  return rows;
}

module.exports = {
  fetchQuote,
  buildFieldRows,
  formatNumber,
  formatMarketCap,
  formatVolume,
  deltaFrom,
};
