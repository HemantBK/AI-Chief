/**
 * Dashboard component module for Chef Scientia.
 * Handles metric cards, charts, and the safety flags table.
 */

let safetyTrendChart = null;
let categoryChart = null;

/**
 * Renders the metric cards with big numbers.
 * @param {object} data - Metrics object with totalQueries, avgSafety, responseTimeP50, activeFlags.
 */
export function renderMetricCards(data) {
  setMetric('metric-total-queries', formatNumber(data.totalQueries ?? data.total_queries ?? 0));
  setMetric('metric-avg-safety', formatPercent(data.avgSafety ?? data.avg_safety ?? 0));
  setMetric('metric-response-time', formatMs(data.responseTimeP50 ?? data.response_time_p50 ?? 0));
  setMetric('metric-active-flags', String(data.activeFlags ?? data.active_flags ?? 0));

  // Optional trend indicators
  setTrend('trend-total-queries', data.queryTrend);
  setTrend('trend-avg-safety', data.safetyTrend);
  setTrend('trend-response-time', data.responseTrend, true); // inverted: lower is better
  setTrend('trend-active-flags', data.flagsTrend, true);
}

/**
 * Renders the safety score trend line chart.
 * @param {object} trendData - { labels: string[], values: number[] }
 */
export function renderSafetyChart(trendData) {
  const ctx = document.getElementById('safety-trend-chart');
  if (!ctx) return;

  const labels = trendData.labels || trendData.timestamps || [];
  const values = trendData.values || trendData.scores || [];

  if (safetyTrendChart) {
    safetyTrendChart.data.labels = labels;
    safetyTrendChart.data.datasets[0].data = values;
    safetyTrendChart.update();
    return;
  }

  safetyTrendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Safety Score',
        data: values,
        borderColor: '#FF6B35',
        backgroundColor: 'rgba(255, 107, 53, 0.08)',
        borderWidth: 2.5,
        pointBackgroundColor: '#FF6B35',
        pointBorderColor: '#FFFFFF',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.35,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#2A2622',
          titleFont: { family: 'Inter', size: 12 },
          bodyFont: { family: 'Inter', size: 12 },
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: (ctx) => `Score: ${(ctx.parsed.y * 100).toFixed(0)}%`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { family: 'Inter', size: 11 },
            color: '#9E9689',
            maxTicksLimit: 8,
          },
        },
        y: {
          min: 0,
          max: 1,
          grid: {
            color: 'rgba(0,0,0,0.04)',
            drawBorder: false,
          },
          ticks: {
            font: { family: 'Inter', size: 11 },
            color: '#9E9689',
            callback: (v) => `${(v * 100).toFixed(0)}%`,
            stepSize: 0.2,
          },
        },
      },
      interaction: {
        intersect: false,
        mode: 'index',
      },
    },
  });
}

/**
 * Renders the category distribution doughnut chart.
 * @param {object} distribution - { labels: string[], values: number[] } or { [category]: count }
 */
export function renderCategoryChart(distribution) {
  const ctx = document.getElementById('category-chart');
  if (!ctx) return;

  let labels, values;
  if (Array.isArray(distribution.labels)) {
    labels = distribution.labels;
    values = distribution.values;
  } else {
    labels = Object.keys(distribution);
    values = Object.values(distribution);
  }

  const colors = ['#FF6B35', '#004E64', '#22C55E', '#8B5CF6', '#3B82F6', '#EAB308', '#EC4899'];

  if (categoryChart) {
    categoryChart.data.labels = labels;
    categoryChart.data.datasets[0].data = values;
    categoryChart.update();
    return;
  }

  categoryChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors.slice(0, labels.length),
        borderWidth: 2,
        borderColor: '#FFFFFF',
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { family: 'Inter', size: 12 },
            color: '#5C554D',
            padding: 14,
            usePointStyle: true,
            pointStyleWidth: 10,
          },
        },
        tooltip: {
          backgroundColor: '#2A2622',
          titleFont: { family: 'Inter', size: 12 },
          bodyFont: { family: 'Inter', size: 12 },
          padding: 10,
          cornerRadius: 8,
        },
      },
    },
  });
}

/**
 * Renders the recent safety flags table.
 * @param {Array} flags - Array of flag objects with time, question, flagType, safetyScore, status.
 */
export function renderFlagsTable(flags) {
  const tbody = document.getElementById('flags-table-body');
  if (!tbody) return;

  if (!flags || flags.length === 0) {
    tbody.innerHTML = `
      <tr class="table-empty">
        <td colspan="5">No safety flags recorded yet</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = flags.map(flag => {
    const time = formatTime(flag.time || flag.timestamp || flag.created_at);
    const question = escapeHtml(truncate(flag.question || flag.query || '', 60));
    const flagType = flag.flagType || flag.flag_type || flag.type || 'review';
    const score = flag.safetyScore ?? flag.safety_score ?? 0;
    const status = flag.status || 'open';

    const flagTypeClass = `flag-${flagType.toLowerCase().replace(/\s+/g, '-')}`;
    const statusClass = `status-${status.toLowerCase()}`;

    return `
      <tr>
        <td>${time}</td>
        <td title="${escapeHtml(flag.question || flag.query || '')}">${question}</td>
        <td><span class="flag-type-badge ${flagTypeClass}">${capitalize(flagType)}</span></td>
        <td>${renderInlineScore(score)}</td>
        <td><span class="status-badge ${statusClass}">${capitalize(status)}</span></td>
      </tr>
    `;
  }).join('');
}

// --- Helpers ---

function setMetric(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setTrend(id, value, inverted = false) {
  const el = document.getElementById(id);
  if (!el || value == null) return;
  const isPositive = inverted ? value < 0 : value > 0;
  const arrow = value > 0 ? '\u2191' : value < 0 ? '\u2193' : '';
  el.textContent = `${arrow} ${Math.abs(value).toFixed(1)}%`;
  el.className = `metric-trend ${isPositive ? 'trend-up' : 'trend-down'}`;
}

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function formatPercent(v) {
  return (v * 100).toFixed(1) + '%';
}

function formatMs(ms) {
  if (ms >= 1000) return (ms / 1000).toFixed(1) + 's';
  return Math.round(ms) + 'ms';
}

function formatTime(ts) {
  if (!ts) return '--';
  try {
    const d = new Date(ts);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return String(ts);
  }
}

function renderInlineScore(score) {
  const pct = (score * 100).toFixed(0);
  let color;
  if (score > 0.7) color = '#22C55E';
  else if (score >= 0.4) color = '#EAB308';
  else color = '#EF4444';
  return `<span style="color:${color}; font-weight:600">${pct}%</span>`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function truncate(str, maxLen) {
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/-/g, ' ');
}
