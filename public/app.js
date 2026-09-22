const FIELD_LABELS = {
  price: 'Price',
  changeSinceLast: 'Since last report',
  change24h: 'Last 24 hours',
  changeMonth: 'Last month',
  changeYear: 'Last year',
  open: 'Open',
  high: 'High',
  low: 'Low',
  previousClose: 'Prev Close',
  volume: 'Volume',
  marketCap: 'Market Cap',
  peRatio: 'P/E Ratio',
  week52High: '52W High',
  week52Low: '52W Low',
  dividend: 'Dividend',
};

const secret = localStorage.getItem('nikotracker_panel_secret') || '';

function headers(extra = {}) {
  const h = { 'Content-Type': 'application/json', ...extra };
  if (secret) h['x-panel-secret'] = secret;
  return h;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: headers(options.headers),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

function showToast(message, ok = true) {
  const el = document.getElementById('toast');
  el.hidden = false;
  el.textContent = message;
  el.className = `toast ${ok ? 'ok' : 'err'}`;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    el.hidden = true;
  }, 4200);
}

function fmt(n, digits = 2) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return Number(n).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtCap(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  const v = Number(n);
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(2)}K`;
  return v.toLocaleString('en-US');
}

function signed(n, digits = 2) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  const v = Number(n);
  return `${v > 0 ? '+' : ''}${fmt(v, digits)}`;
}

function renderFieldToggles(fields = {}) {
  const root = document.getElementById('fieldToggles');
  root.innerHTML = '';
  for (const [key, label] of Object.entries(FIELD_LABELS)) {
    const id = `field_${key}`;
    const wrap = document.createElement('label');
    wrap.className = 'switch';
    wrap.innerHTML = `<input type="checkbox" id="${id}" data-field="${key}" ${
      fields[key] ? 'checked' : ''
    } /><span>${label}</span>`;
    root.appendChild(wrap);
  }
}

function collectFields() {
  const fields = {};
  document.querySelectorAll('#fieldToggles input[data-field]').forEach((input) => {
    fields[input.dataset.field] = input.checked;
  });
  return fields;
}

function fillForm(config) {
  document.getElementById('enabled').checked = Boolean(config.enabled);
  document.getElementById('includeChart').checked = config.includeChart !== false;
  document.getElementById('includeChartHint').checked = Boolean(config.includeChartHint);
  document.getElementById('symbol').value = config.symbol || 'FTGFF';
  document.getElementById('companyName').value =
    config.companyName || 'Firan Technology Group Corp';
  document.getElementById('exchange').value = config.exchange || 'OTCMKTS';
  document.getElementById('embedColor').value = config.embedColor || '#2b6cb0';
  renderFieldToggles(config.fields || {});
}

async function loadChannels(selectedId) {
  const select = document.getElementById('channelId');
  const { channels } = await api('/api/channels');
  select.innerHTML = '';

  if (!channels.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No channels found — invite the bot to a server';
    select.appendChild(opt);
    return;
  }

  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = 'Select a channel…';
  select.appendChild(blank);

  for (const ch of channels) {
    const opt = document.createElement('option');
    opt.value = ch.id;
    opt.textContent = ch.label;
    if (ch.id === selectedId) opt.selected = true;
    select.appendChild(opt);
  }
}

function periodLine(label, period) {
  if (!period || period.change == null) {
    return `<div class="period"><span>${label}</span><strong class="flat">—</strong></div>`;
  }
  const up = period.change >= 0;
  return `<div class="period"><span>${label}</span><strong class="${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${signed(period.change)} · ${signed(period.changePercent)}%</strong></div>`;
}

function renderPreview(quote) {
  const root = document.getElementById('preview');
  const p = quote.periods || {};
  const primary = p.sinceLastReport?.change != null ? p.sinceLastReport : p.day;
  const up = (primary?.change ?? quote.change ?? 0) >= 0;
  root.innerHTML = `
    <div class="symbol">${quote.exchange || 'OTCMKTS'} · ${quote.symbol}</div>
    <div class="price">${fmt(quote.price)} ${quote.currency || 'USD'}</div>
    <div class="change ${up ? 'up' : 'down'}">
      ${primary?.change == null ? 'First report — baseline will be set' : `${up ? '▲' : '▼'} ${signed(primary.change)} (${signed(primary.changePercent)}%) since last report`}
    </div>
    <div class="periods">
      ${periodLine('Since last report', p.sinceLastReport)}
      ${periodLine('Last 24 hours', p.day)}
      ${periodLine('Last month', p.month)}
      ${periodLine('Last year', p.year)}
    </div>
    <div class="metrics">
      <div class="metric"><span>Open</span><strong>${fmt(quote.open)}</strong></div>
      <div class="metric"><span>High</span><strong>${fmt(quote.high)}</strong></div>
      <div class="metric"><span>Low</span><strong>${fmt(quote.low)}</strong></div>
      <div class="metric"><span>Mkt Cap</span><strong>${fmtCap(quote.marketCap)}</strong></div>
    </div>
  `;
}

function renderScheduler(status, bot) {
  const root = document.getElementById('schedulerMeta');
  const rows = [
    ['Bot', bot.ready ? bot.tag || 'Online' : 'Offline'],
    ['Auto reports', status.enabled ? 'On' : 'Off'],
    ['Market', status.marketStatus === 'open' ? 'Open' : 'Closed'],
    ['Schedule', '4 reports per trading day + close'],
    ['Next post', status.nextPostAt ? new Date(status.nextPostAt).toLocaleString() :
      status.enabled ? 'Choose a channel' : 'Disabled'],
    ['Last report', status.lastReportAt ? new Date(status.lastReportAt).toLocaleString() : 'Never'],
    ['Last tick', status.lastTickAt ? new Date(status.lastTickAt).toLocaleString() : '—'],
    ['Last error', status.lastError || 'None'],
  ];
  root.innerHTML = rows
    .map(
      ([dt, dd]) =>
        `<div><dt>${dt}</dt><dd title="${String(dd).replace(/"/g, '&quot;')}">${dd}</dd></div>`
    )
    .join('');
}

function setBotStatus(bot) {
  const pill = document.getElementById('botStatus');
  const text = document.getElementById('botStatusText');
  pill.classList.toggle('online', Boolean(bot.ready));
  pill.classList.toggle('offline', !bot.ready);
  text.textContent = bot.ready
    ? `Online · ${bot.tag}`
    : 'Bot offline — check DISCORD_TOKEN';
}

function setInvite(inviteUrl) {
  const openBtn = document.getElementById('inviteOpenBtn');
  const copyBtn = document.getElementById('inviteCopyBtn');
  const text = document.getElementById('inviteUrlText');

  if (!inviteUrl) {
    openBtn.removeAttribute('href');
    openBtn.classList.add('disabled');
    copyBtn.disabled = true;
    text.textContent = 'Invite unavailable until the bot is online.';
    return;
  }

  openBtn.href = inviteUrl;
  openBtn.classList.remove('disabled');
  copyBtn.disabled = false;
  text.textContent = inviteUrl;
}

async function refreshAll() {
  const [{ config }, status] = await Promise.all([
    api('/api/config'),
    api('/api/status'),
  ]);

  fillForm(config);
  await loadChannels(config.channelId);
  setBotStatus(status.bot);
  setInvite(status.bot.inviteUrl);
  renderScheduler(status.scheduler, status.bot);

  try {
    const preview = await api('/api/preview');
    renderPreview(preview.quote);
  } catch (err) {
    document.getElementById('preview').innerHTML =
      `<div class="preview-error">${err.message}</div>`;
  }
}

document.getElementById('settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('saveBtn');
  btn.disabled = true;
  try {
    const payload = {
      enabled: document.getElementById('enabled').checked,
      includeChart: document.getElementById('includeChart').checked,
      includeChartHint: document.getElementById('includeChartHint').checked,
      channelId: document.getElementById('channelId').value,
      symbol: document.getElementById('symbol').value.trim(),
      companyName: document.getElementById('companyName').value.trim(),
      exchange: document.getElementById('exchange').value.trim(),
      embedColor: document.getElementById('embedColor').value,
      fields: collectFields(),
    };
    const result = await api('/api/config', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    showToast('Settings saved. Scheduler updated.');
    renderScheduler(result.scheduler, (await api('/api/status')).bot);
  } catch (err) {
    showToast(err.message, false);
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('reportNowBtn').addEventListener('click', async () => {
  const btn = document.getElementById('reportNowBtn');
  btn.disabled = true;
  try {
    const result = await api('/api/report-now', { method: 'POST', body: '{}' });
    if (result.skipped) throw new Error(result.reason);
    showToast('Report sent to the selected channel.');
    await refreshAll();
  } catch (err) {
    showToast(err.message, false);
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('refreshBtn').addEventListener('click', async () => {
  try {
    await refreshAll();
    showToast('Refreshed.');
  } catch (err) {
    showToast(err.message, false);
  }
});

document.getElementById('inviteCopyBtn').addEventListener('click', async () => {
  const url = document.getElementById('inviteOpenBtn').href;
  if (!url || url.endsWith('#')) {
    showToast('Invite link not ready yet.', false);
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    showToast('Invite link copied.');
  } catch {
    showToast('Could not copy — select the link text manually.', false);
  }
});

refreshAll().catch((err) => {
  showToast(err.message, false);
  setBotStatus({ ready: false });
  setInvite(null);
});

setInterval(() => {
  api('/api/status')
    .then((status) => {
      setBotStatus(status.bot);
      setInvite(status.bot.inviteUrl);
      renderScheduler(status.scheduler, status.bot);
    })
    .catch(() => {
      setBotStatus({ ready: false });
      setInvite(null);
    });
}, 15000);
