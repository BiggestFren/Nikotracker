const {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionFlagsBits,
  AttachmentBuilder,
} = require('discord.js');
const { loadConfig, updateConfig } = require('./config');
const { fetchQuote } = require('./stock');
const { buildStockEmbed } = require('./embed');
const { renderPriceChart } = require('./chart');
const { marketStatus } = require('./market');

const BOT_PERMISSIONS =
  PermissionFlagsBits.ViewChannel |
  PermissionFlagsBits.SendMessages |
  PermissionFlagsBits.EmbedLinks |
  PermissionFlagsBits.AttachFiles;

let client = null;
let postInFlight = false;

function completed(config, sessionDate, slot) {
  return config.scheduledSession === sessionDate && config.completedSlots?.includes(slot);
}

function markCompleted(sessionDate, slot) {
  const current = loadConfig();
  const slots = current.scheduledSession === sessionDate ? current.completedSlots || [] : [];
  updateConfig({ scheduledSession: sessionDate, completedSlots: [...new Set([...slots, slot])] });
}

function getClient() {
  return client;
}

function createClient() {
  client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });
  return client;
}

function getInviteUrl() {
  const clientId = client?.user?.id || process.env.DISCORD_CLIENT_ID || null;
  if (!clientId) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    permissions: String(BOT_PERMISSIONS),
    scope: 'bot applications.commands',
  });
  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}

async function listTextChannels() {
  if (!client?.isReady()) return [];

  const channels = [];
  for (const [, guild] of client.guilds.cache) {
    const me = guild.members.me;
    for (const [, channel] of guild.channels.cache) {
      if (
        channel.type !== ChannelType.GuildText &&
        channel.type !== ChannelType.GuildAnnouncement
      ) {
        continue;
      }

      const canSend =
        !me ||
        channel.permissionsFor(me)?.has([
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
        ]);

      if (!canSend) continue;

      channels.push({
        id: channel.id,
        name: channel.name,
        guildId: guild.id,
        guildName: guild.name,
        label: `#${channel.name} · ${guild.name}`,
      });
    }
  }

  channels.sort((a, b) => a.label.localeCompare(b.label));
  return channels;
}

async function sendStockReport({ force = false, kind = 'regular', sessionDate = null, slot = null } = {}) {
  if (!client?.isReady()) {
    throw new Error('Bot is not connected to Discord yet.');
  }

  const config = loadConfig();

  if (!force && !config.enabled) {
    return { skipped: true, reason: 'Reporting is disabled.' };
  }

  if (slot && completed(config, sessionDate, slot)) {
    return { skipped: true, reason: 'This session post was already sent.' };
  }

  if (!force && kind === 'regular' && marketStatus() !== 'open') {
    return { skipped: true, reason: 'Market is closed.' };
  }

  if (!config.channelId) {
    throw new Error('No Discord channel selected. Pick one in the web panel.');
  }

  if (postInFlight) {
    return { skipped: true, reason: 'A report is already being sent.' };
  }

  postInFlight = true;
  try {
    const channel = await client.channels.fetch(config.channelId);
    if (!channel || !channel.isTextBased()) {
      throw new Error('Selected channel is missing or not a text channel.');
    }

    const quote = await fetchQuote(config.symbol || 'FTGFF', {
      lastReportPrice: config.lastReportPrice,
    });

    if (!force && kind === 'regular' && quote.marketState !== 'REGULAR') {
      return { skipped: true, reason: `Yahoo reports market state ${quote.marketState}.` };
    }

    const periods = quote.periods || {};
    const primary =
      periods.sinceLastReport?.change != null
        ? periods.sinceLastReport
        : periods.day;
    const up = (primary?.change ?? quote.change ?? 0) >= 0;

    // Color the chart from the visible window trend (not just today)
    const window = (quote.history || []).slice(-130);
    const chartUp =
      window.length >= 2
        ? window[window.length - 1].close >= window[0].close
        : up;

    const files = [];
    let chartName = null;

    if (config.includeChart !== false && (kind === 'close' || force) && quote.history?.length) {
      try {
        const png = await renderPriceChart({
          symbol: config.symbol || quote.symbol,
          history: quote.history,
          up: chartUp,
        });
        chartName = 'chart.png';
        files.push(new AttachmentBuilder(png, { name: chartName }));
      } catch (err) {
        console.error('[bot] chart render failed:', err.message);
      }
    }

    const embed = buildStockEmbed(quote, config, {
      chartAttachmentName: chartName,
      kind,
      manualClosed: force && marketStatus() === 'closed',
      manual: force,
    });

    const message = await channel.send({
      embeds: [embed],
      files: files.length ? files : undefined,
    });

    const latest = loadConfig();
    const slots = latest.scheduledSession === sessionDate ? latest.completedSlots || [] : [];
    updateConfig({
      lastReportAt: new Date().toISOString(),
      lastReportPrice: quote.price,
      ...(slot ? {
        scheduledSession: sessionDate,
        completedSlots: [...new Set([...slots, slot])],
      } : {}),
    });

    return {
      ok: true,
      messageId: message.id,
      channelId: channel.id,
      quote,
      chartAttached: Boolean(chartName),
    };
  } finally {
    postInFlight = false;
  }
}

async function sendMarketCloseMessage({ sessionDate, nextOpenAt }) {
  if (!client?.isReady()) throw new Error('Bot is not connected to Discord yet.');
  const config = loadConfig();
  if (!config.enabled) return { skipped: true, reason: 'Reporting is disabled.' };
  if (completed(config, sessionDate, 'close-message')) {
    return { skipped: true, reason: 'Closing message was already sent.' };
  }
  if (!config.channelId) throw new Error('No Discord channel selected. Pick one in the web panel.');
  if (postInFlight) return { skipped: true, reason: 'A post is already being sent.' };

  postInFlight = true;
  try {
    const channel = await client.channels.fetch(config.channelId);
    if (!channel || !channel.isTextBased()) {
      throw new Error('Selected channel is missing or not a text channel.');
    }
    const reopen = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'long', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    }).format(nextOpenAt);
    const message = await channel.send(`Market is closed until **${reopen}**. See you then!`);
    markCompleted(sessionDate, 'close-message');
    return { ok: true, messageId: message.id, channelId: channel.id };
  } finally {
    postInFlight = false;
  }
}

function getBotStatus() {
  return {
    ready: Boolean(client?.isReady()),
    tag: client?.user?.tag || null,
    id: client?.user?.id || null,
    guildCount: client?.guilds?.cache?.size || 0,
    inviteUrl: getInviteUrl(),
  };
}

module.exports = {
  createClient,
  getClient,
  listTextChannels,
  sendStockReport,
  sendMarketCloseMessage,
  getBotStatus,
  getInviteUrl,
  BOT_PERMISSIONS,
};
