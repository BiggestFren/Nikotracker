const { EmbedBuilder } = require('discord.js');
const { buildFieldRows, formatNumber } = require('./stock');

function signed(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return `${value > 0 ? '+' : ''}${formatNumber(value)}`;
}

function movement(period) {
  if (period?.change == null) return '—';
  const arrow = period.change > 0 ? '▲' : period.change < 0 ? '▼' : '•';
  const percent = period.changePercent == null ? '' : ` (${signed(period.changePercent)}%)`;
  return `${arrow} ${signed(period.change)}${percent}`;
}

function compactFields(quote, fields) {
  const rows = [];
  if (fields.open) rows.push({ name: 'Open', value: `${formatNumber(quote.open)} ${quote.currency}`, inline: true });
  if (fields.high && fields.low) {
    rows.push({ name: 'Day range', value: `${formatNumber(quote.low)}–${formatNumber(quote.high)} ${quote.currency}`, inline: true });
  } else {
    if (fields.high) rows.push({ name: 'High', value: `${formatNumber(quote.high)} ${quote.currency}`, inline: true });
    if (fields.low) rows.push({ name: 'Low', value: `${formatNumber(quote.low)} ${quote.currency}`, inline: true });
  }
  if (fields.volume) rows.push({ name: 'Volume', value: formatNumber(quote.volume, 0), inline: true });
  return rows;
}

function buildStockEmbed(quote, config, { chartAttachmentName = null, kind = 'regular', manualClosed = false, manual = false } = {}) {
  const fields = config.fields || {};
  const symbol = config.symbol || quote.symbol;
  const rich = kind === 'close' || manual || manualClosed;
  const today = quote.periods?.day?.change != null ? quote.periods.day : quote;
  const color = today.change > 0 ? 0x22c55e : today.change < 0 ? 0xef4444 : config.embedColor || 0x2b6cb0;
  const lines = [];

  if (kind === 'close') lines.push('**FINAL SESSION REPORT · LAST REPORTED PRICE**');
  else if (manualClosed) lines.push('**MARKET CLOSED · MANUAL SNAPSHOT OF LAST REPORTED PRICE**');
  if (fields.price !== false) lines.push(`# ${formatNumber(quote.price)} ${quote.currency}`);
  if (fields.change24h !== false && today.change != null) {
    lines.push(`**${movement(today)} ${manualClosed ? 'last session' : 'today'}**`);
  }
  if (fields.changeSinceLast !== false) {
    const since = quote.periods?.sinceLastReport;
    lines.push(`Since last post: ${since?.baseline == null ? 'First report' : movement(since)}`);
  }

  if (rich) {
    if ((kind === 'close' || manualClosed) && quote.regularMarketTime) {
      lines.push(`Last regular trade: <t:${Math.floor(new Date(quote.regularMarketTime).getTime() / 1000)}:F>`);
    }
    const longer = [
      ['1 month', fields.changeMonth, quote.periods?.month],
      ['1 year', fields.changeYear, quote.periods?.year],
    ].filter(([, enabled, period]) => enabled !== false && period?.change != null);
    if (longer.length) {
      lines.push('', '**Longer-term performance**');
      for (const [label, , period] of longer) lines.push(`${label}: ${movement(period)}`);
    }
  }

  const timestamp = (kind === 'close' || manualClosed) && quote.regularMarketTime
    ? quote.regularMarketTime : quote.fetchedAt;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: config.companyName || quote.name })
    .setTitle(`${symbol} · ${config.exchange || quote.exchange}`)
    .setDescription(lines.join('\n') || 'No fields enabled.')
    .setTimestamp(new Date(timestamp))
    .setFooter({ text: `${kind === 'close' ? 'Session complete' : manualClosed ? 'Market closed' : quote.marketState === 'REGULAR' ? 'Market open' : quote.marketState} · ${quote.quoteSourceName || 'Yahoo Finance'}` });

  if (config.includeChartHint) {
    embed.setURL(`https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`);
  }
  if (chartAttachmentName) embed.setImage(`attachment://${chartAttachmentName}`);
  const metrics = rich ? buildFieldRows(quote, fields) : compactFields(quote, fields);
  if (metrics.length) embed.addFields(metrics);
  return embed;
}

module.exports = { buildStockEmbed };
