/**
 * Renders a price chart PNG for Discord embeds via QuickChart.
 */
async function renderPriceChart({
  symbol,
  history,
  up = true,
  rangeLabel = '6 months',
} = {}) {
  if (!history?.length) {
    throw new Error('No history available to render chart.');
  }

  // Keep the chart readable — last ~130 trading days (~6 months)
  const points = history.slice(-130);
  const labelIndexes = new Set([0, 1, 2, 3].map((step) => Math.round((points.length - 1) * step / 3)));
  const labels = points.map((p, index) => {
    if (!labelIndexes.has(index)) return '';
    const d = new Date(p.date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });
  const prices = points.map((p) => Number(p.close));

  const line = up ? 'rgb(74, 222, 128)' : 'rgb(251, 113, 133)';
  const fill = up ? 'rgba(74, 222, 128, 0.18)' : 'rgba(251, 113, 133, 0.18)';

  const chart = {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: symbol,
          data: prices,
          borderColor: line,
          backgroundColor: fill,
          borderWidth: 2.5,
          fill: true,
          tension: 0.1,
          pointRadius: 0,
          pointHoverRadius: 3,
        },
      ],
    },
    options: {
      layout: { padding: { top: 10, right: 18, bottom: 4, left: 8 } },
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: `${symbol} · ${rangeLabel} trend`,
          color: '#cbd5e1',
          font: { size: 20, weight: '600' },
          padding: { bottom: 12 },
        },
      },
      scales: {
        x: {
          ticks: {
            autoSkip: false,
            color: '#94a3b8',
            font: { size: 14 },
            maxRotation: 0,
          },
          grid: { display: false },
          border: { display: false },
        },
        y: {
          ticks: {
            color: '#94a3b8',
            font: { size: 14 },
            maxTicksLimit: 4,
          },
          grid: { color: 'rgba(148, 163, 184, 0.1)' },
          border: { display: false },
        },
      },
    },
  };

  const res = await fetch('https://quickchart.io/chart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      version: '4',
      width: 640,
      height: 260,
      devicePixelRatio: 2,
      backgroundColor: '#0f172a',
      format: 'png',
      chart,
    }),
  });

  if (!res.ok) {
    throw new Error(`Chart render failed (${res.status})`);
  }

  return Buffer.from(await res.arrayBuffer());
}

module.exports = {
  renderPriceChart,
};
