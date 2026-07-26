const path = require('path');
const express = require('express');
const cors = require('cors');
const { loadConfig, updateConfig, DEFAULT_CONFIG } = require('./config');
const {
  listTextChannels,
  sendStockReport,
  getBotStatus,
  getInviteUrl,
} = require('./bot');
const { restartScheduler, getSchedulerStatus } = require('./scheduler');
const { fetchQuote } = require('./stock');

function createServer({ onConfigChange } = {}) {
  const app = express();
  const panelSecret = process.env.PANEL_SECRET || '';

  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/api/health', (_req, res) => {
    const bot = getBotStatus();
    res.json({
      ok: true,
      botReady: bot.ready,
      tag: bot.tag,
      uptime: Math.floor(process.uptime()),
    });
  });

  app.use('/api', (req, res, next) => {
    if (!panelSecret) return next();
    if (req.path === '/health') return next();
    const provided =
      req.headers['x-panel-secret'] ||
      req.query.secret ||
      req.body?.secret;
    if (provided !== panelSecret) {
      return res.status(401).json({ error: 'Unauthorized. Set PANEL_SECRET header.' });
    }
    return next();
  });

  app.get('/api/status', async (_req, res) => {
    try {
      const config = loadConfig();
      res.json({
        bot: getBotStatus(),
        scheduler: getSchedulerStatus(),
        config: {
          enabled: config.enabled,
          channelId: config.channelId,
          symbol: config.symbol,
          intervalHours: config.intervalHours,
          lastReportAt: config.lastReportAt,
        },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/config', (_req, res) => {
    res.json({
      config: loadConfig(),
      defaults: DEFAULT_CONFIG,
    });
  });

  app.put('/api/config', (req, res) => {
    try {
      const body = req.body || {};
      const intervalHours = Number(body.intervalHours);
      if (!Number.isFinite(intervalHours) || intervalHours < 0.25 || intervalHours > 168) {
        return res.status(400).json({
          error: 'intervalHours must be between 0.25 and 168.',
        });
      }

      const next = updateConfig({
        enabled: Boolean(body.enabled),
        channelId: String(body.channelId || ''),
        symbol: String(body.symbol || 'FTGFF').trim().toUpperCase(),
        companyName: String(body.companyName || DEFAULT_CONFIG.companyName).trim(),
        exchange: String(body.exchange || DEFAULT_CONFIG.exchange).trim(),
        intervalHours,
        embedColor: String(body.embedColor || DEFAULT_CONFIG.embedColor),
        includeChart: body.includeChart !== false,
        includeChartHint: Boolean(body.includeChartHint),
        fields: body.fields || DEFAULT_CONFIG.fields,
      });

      restartScheduler();
      if (onConfigChange) onConfigChange(next);

      res.json({ ok: true, config: next, scheduler: getSchedulerStatus() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/invite', (_req, res) => {
    const inviteUrl = getInviteUrl();
    if (!inviteUrl) {
      return res.status(503).json({
        error: 'Bot is offline — invite link needs the bot client ID.',
      });
    }
    res.json({
      inviteUrl,
      permissions: [
        'View Channel',
        'Send Messages',
        'Embed Links',
        'Attach Files',
      ],
    });
  });

  app.get('/api/channels', async (_req, res) => {
    try {
      const channels = await listTextChannels();
      res.json({ channels });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/preview', async (_req, res) => {
    try {
      const config = loadConfig();
      const quote = await fetchQuote(config.symbol || 'FTGFF', {
        lastReportPrice: config.lastReportPrice,
      });
      res.json({ quote, config });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/report-now', async (_req, res) => {
    try {
      const result = await sendStockReport({ force: true });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return app;
}

module.exports = {
  createServer,
};
