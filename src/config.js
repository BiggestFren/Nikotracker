const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'data', 'config.json');

const DEFAULT_CONFIG = {
  enabled: true,
  channelId: '',
  symbol: 'FTGFF',
  companyName: 'Firan Technology Group Corp',
  exchange: 'OTCMKTS',
  embedColor: '#2b6cb0',
  includeChart: true,
  includeChartHint: true,
  fields: {
    price: true,
    changeSinceLast: true,
    change24h: true,
    changeMonth: true,
    changeYear: true,
    open: true,
    high: true,
    low: true,
    marketCap: true,
    peRatio: false,
    week52High: true,
    week52Low: true,
    volume: true,
    previousClose: false,
    dividend: false,
  },
  lastReportAt: null,
  lastReportPrice: null,
  scheduledSession: null,
  completedSlots: [],
};

function ensureDataDir() {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadConfig() {
  ensureDataDir();
  if (!fs.existsSync(CONFIG_PATH)) {
    saveConfig(DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG, fields: { ...DEFAULT_CONFIG.fields } };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const config = {
      ...DEFAULT_CONFIG,
      ...raw,
      fields: { ...DEFAULT_CONFIG.fields, ...(raw.fields || {}) },
    };
    delete config.intervalHours;
    return config;
  } catch {
    return { ...DEFAULT_CONFIG, fields: { ...DEFAULT_CONFIG.fields } };
  }
}

function saveConfig(config) {
  ensureDataDir();
  const next = {
    ...DEFAULT_CONFIG,
    ...config,
    fields: { ...DEFAULT_CONFIG.fields, ...(config.fields || {}) },
  };
  delete next.intervalHours;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function updateConfig(partial) {
  const current = loadConfig();
  const next = {
    ...current,
    ...partial,
    fields: {
      ...current.fields,
      ...(partial.fields || {}),
    },
  };
  return saveConfig(next);
}

module.exports = {
  DEFAULT_CONFIG,
  loadConfig,
  saveConfig,
  updateConfig,
};
