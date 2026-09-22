const { loadConfig } = require('./config');
const { sendStockReport, sendMarketCloseMessage } = require('./bot');
const { easternDate, duePosts, nextOpen, nextPost, marketStatus } = require('./market');

let timer = null;
let tickInFlight = false;
let lastTickAt = null;
let lastError = null;

function completedToday(config, now) {
  return config.scheduledSession === easternDate(now) ? config.completedSlots || [] : [];
}

async function tick(onReport) {
  if (tickInFlight) return;
  tickInFlight = true;
  const now = new Date();
  lastTickAt = now.toISOString();
  try {
    const config = loadConfig();
    if (!config.enabled || !config.channelId) return;
    const sessionDate = easternDate(now);
    for (const post of duePosts(now, completedToday(config, now))) {
      const current = loadConfig();
      if (!current.enabled || !current.channelId) break;
      if (completedToday(current, now).includes(post.id)) continue;

      let result;
      if (post.id === 'close-message') {
        if (!completedToday(current, now).includes('close-report')) continue;
        result = await sendMarketCloseMessage({ sessionDate, nextOpenAt: nextOpen(now) });
      } else {
        result = await sendStockReport({
          kind: post.id === 'close-report' ? 'close' : 'regular',
          sessionDate,
          slot: post.id,
        });
      }
      if (result?.ok) lastError = null;
      else if (result?.reason) lastError = result.reason;
      if (onReport) onReport(null, result);
    }
  } catch (err) {
    lastError = err.message || String(err);
    console.error('[scheduler] post failed:', lastError);
    if (onReport) onReport(err, null);
  } finally {
    tickInFlight = false;
  }
}

function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

function startScheduler(onReport) {
  stopScheduler();
  timer = setInterval(() => tick(onReport), 30 * 1000);
  void tick(onReport);
  console.log('[scheduler] 4 reports per U.S. trading day, plus close report and signoff');
  return getSchedulerStatus();
}

function restartScheduler(onReport) {
  return startScheduler(onReport);
}

function getSchedulerStatus() {
  const config = loadConfig();
  const now = new Date();
  const completed = completedToday(config, now);
  const due = duePosts(now, completed);
  return {
    running: Boolean(timer),
    enabled: config.enabled,
    marketStatus: marketStatus(now),
    reportsPerSession: 4,
    nextPostAt: config.enabled && config.channelId
      ? (due[0]?.at || nextPost(now, completed)).toISOString()
      : null,
    lastTickAt,
    lastError,
    lastReportAt: config.lastReportAt,
  };
}

module.exports = { startScheduler, stopScheduler, restartScheduler, getSchedulerStatus };
