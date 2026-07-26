require('dotenv').config();

const { createClient, sendStockReport } = require('./bot');
const { createServer } = require('./server');
const { startScheduler } = require('./scheduler');
const { loadConfig } = require('./config');

const token = process.env.DISCORD_TOKEN;
const port = Number(process.env.PORT) || 3847;
const hasToken = Boolean(token && token !== 'your_bot_token_here');

async function main() {
  const app = createServer();

  app.listen(port, '0.0.0.0', () => {
    console.log(`[panel] web settings → http://0.0.0.0:${port}`);
  });

  if (!hasToken) {
    console.warn(
      '\n[bot] DISCORD_TOKEN not set in .env yet.\n' +
        '      Panel is up — paste your token into .env, then restart with npm start.\n'
    );
    return;
  }

  const client = createClient();

  client.once('ready', () => {
    console.log(`[bot] logged in as ${client.user.tag}`);
    const config = loadConfig();
    console.log(
      `[bot] tracking ${config.symbol}` +
        (config.channelId ? ` → channel ${config.channelId}` : ' (no channel selected yet)')
    );
    startScheduler();
  });

  client.on('error', (err) => {
    console.error('[bot] client error:', err.message);
  });

  await client.login(token);
}

main().catch((err) => {
  console.error('Failed to start Nikotracker:', err);
  process.exit(1);
});

module.exports = { sendStockReport };
