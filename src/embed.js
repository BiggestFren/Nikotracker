const { EmbedBuilder } = require('discord.js');
const { buildFieldRows, formatNumber } = require('./stock');

const COLOR_UP = 0x22c55e;
const COLOR_DOWN = 0xef4444;

const ANSI = {
  reset: '\u001b[0m',
  dim: '\u001b[2;37m',
  green: '\u001b[1;32m',
  red: '\u001b[1;31m',
  white: '\u001b[1;37m',
};

function signed(value, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  const sign = n > 0 ? '+' : '';
  return `${sign}${formatNumber(n, digits)}`;
}

function ansiPeriodValue(period, { firstReport = false } = {}) {
  if (firstReport) {
    return `${ANSI.dim}First report — baseline set${ANSI.reset}`;
  }
  if (!period || period.change == null) {
    return `${ANSI.dim}—${ANSI.reset}`;
  }
  const up = period.change >= 0;
  const color = up ? ANSI.green : ANSI.red;
  const arrow = up ? '▲' : '▼';
  const pct =
    period.changePercent == null ? '' : ` (${signed(period.changePercent)}%)`;
  return `${color}${arrow} ${signed(period.change)}${pct}${ANSI.reset}`;
}

function padLabel(label, width = 18) {
  // Spaces in ANSI blocks are monospace — pad with regular spaces
  return label.padEnd(width, ' ');
}

function buildPerformanceBlock(fields, periods) {
  const rows = [];

  const push = (enabled, label, period, opts) => {
    if (enabled === false) return;
    rows.push(
      `${ANSI.dim}${padLabel(label)}${ANSI.reset}${ansiPeriodValue(period, opts)}`
    );
  };

  push(
    fields.changeSinceLast,
    'Since last report',
    periods.sinceLastReport,
    { firstReport: periods.sinceLastReport?.baseline == null }
  );
  push(fields.change24h, 'Last 24 hours', periods.day);
  push(fields.changeMonth, 'Last month', periods.month);
  push(fields.changeYear, 'Last year', periods.year);

  if (!rows.length) return null;
  return ['**Performance**', '```ansi', ...rows, '```'].join('\n');
}

function buildStockEmbed(quote, config, { chartAttachmentName = null } = {}) {
  const fields = config.fields || {};
  const periods = quote.periods || {};
  const titleName = config.companyName || quote.name;
  const exchange = config.exchange || quote.exchange;
  const symbol = config.symbol || quote.symbol;

  const primary =
    periods.sinceLastReport?.change != null
      ? periods.sinceLastReport
      : periods.day;
  const up = (primary?.change ?? quote.change ?? 0) >= 0;
  const color = up ? COLOR_UP : COLOR_DOWN;

  const lines = [];
  if (fields.price !== false) {
    lines.push(`# ${formatNumber(quote.price)} ${quote.currency}`);
  }

  if (quote.marketState === 'POST' && quote.postMarketPrice != null) {
    const ahUp = (quote.postMarketChange ?? 0) >= 0;
    lines.push(
      `After hours **${formatNumber(quote.postMarketPrice)}** · ${ahUp ? '▲' : '▼'} ${signed(quote.postMarketChange)} (${signed(quote.postMarketChangePercent)}%)`
    );
  }

  const perf = buildPerformanceBlock(fields, periods);
  if (perf) {
    lines.push('');
    lines.push(perf);
  }

  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: titleName })
    .setTitle(`${exchange}:${symbol}`)
    .setDescription(lines.join('\n') || 'No fields enabled.')
    .setTimestamp(new Date(quote.fetchedAt))
    .setFooter({
      text:
        `${quote.marketState} · every ${config.intervalHours}h` +
        (config.lastReportAt
          ? ` · last post ${new Date(config.lastReportAt).toLocaleString()}`
          : ' · first report'),
    });

  if (chartAttachmentName) {
    embed.setImage(`attachment://${chartAttachmentName}`);
  }

  const metricFields = buildFieldRows(quote, fields);
  if (metricFields.length) {
    embed.addFields(
      { name: 'Snapshot', value: '\u200b', inline: false },
      ...metricFields
    );
  }

  if (config.includeChartHint) {
    embed.addFields({
      name: 'More',
      value: `[Yahoo Finance](https://finance.yahoo.com/quote/${encodeURIComponent(symbol)})`,
      inline: false,
    });
  }

  return embed;
}

module.exports = {
  buildStockEmbed,
  COLOR_UP,
  COLOR_DOWN,
};
