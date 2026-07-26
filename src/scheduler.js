const { loadConfig } = require('./config');
const { sendStockReport } = require('./bot');

let timer = null;
let lastTickAt = null;
let lastError = null;
let currentMs = null;

function hoursToMs(hours) {
  const h = Math.max(0.25, Number(hours) || 1);
  return Math.round(h * 60 * 60 * 1000);
}

function stopScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  currentMs = null;
}

function startScheduler(onReport) {
  stopScheduler();
  const config = loadConfig();
  const ms = hoursToMs(config.intervalHours);
  currentMs = ms;

  timer = setInterval(async () => {
    lastTickAt = new Date().toISOString();
    try {
      const result = await sendStockReport();
      lastError = null;
      if (onReport) onReport(null, result);
    } catch (err) {
      lastError = err.message || String(err);
      console.error('[scheduler] report failed:', lastError);
      if (onReport) onReport(err, null);
    }
  }, ms);

  // Avoid the timer keeping the process stuck in weird states on Windows
  if (typeof timer.unref === 'function') {
    // Keep process alive via Discord + Express; unref not wanted here
  }

  console.log(
    `[scheduler] reporting every ${config.intervalHours}h (${Math.round(ms / 60000)} min)`
  );
  return { intervalHours: config.intervalHours, intervalMs: ms };
}

function restartScheduler(onReport) {
  return startScheduler(onReport);
}

function getSchedulerStatus() {
  const config = loadConfig();
  return {
    running: Boolean(timer),
    intervalHours: config.intervalHours,
    intervalMs: currentMs ?? hoursToMs(config.intervalHours),
    enabled: config.enabled,
    lastTickAt,
    lastError,
    lastReportAt: config.lastReportAt,
  };
}

module.exports = {
  startScheduler,
  stopScheduler,
  restartScheduler,
  getSchedulerStatus,
  hoursToMs,
};
