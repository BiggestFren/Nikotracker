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

const BOT_PERMISSIONS =
  PermissionFlagsBits.ViewChannel |
  PermissionFlagsBits.SendMessages |
  PermissionFlagsBits.EmbedLinks |
  PermissionFlagsBits.AttachFiles;

let client = null;
let reportInFlight = false;

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

async function sendStockReport({ force = false } = {}) {
  if (!client?.isReady()) {
    throw new Error('Bot is not connected to Discord yet.');
  }

  const config = loadConfig();

  if (!force && !config.enabled) {
    return { skipped: true, reason: 'Reporting is disabled.' };
  }

  if (!config.channelId) {
    throw new Error('No Discord channel selected. Pick one in the web panel.');
  }

  if (reportInFlight) {
    return { skipped: true, reason: 'A report is already being sent.' };
  }

  reportInFlight = true;
  try {
    const channel = await client.channels.fetch(config.channelId);
    if (!channel || !channel.isTextBased()) {
      throw new Error('Selected channel is missing or not a text channel.');
    }

    const quote = await fetchQuote(config.symbol || 'FTGFF', {
      lastReportPrice: config.lastReportPrice,
    });

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

    if (config.includeChart !== false && quote.history?.length) {
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
    });

    const message = await channel.send({
      embeds: [embed],
      files: files.length ? files : undefined,
    });

    updateConfig({
      lastReportAt: new Date().toISOString(),
      lastReportPrice: quote.price,
    });

    return {
      ok: true,
      messageId: message.id,
      channelId: channel.id,
      quote,
      chartAttached: Boolean(chartName),
    };
  } finally {
    reportInFlight = false;
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
  getBotStatus,
  getInviteUrl,
  BOT_PERMISSIONS,
};
