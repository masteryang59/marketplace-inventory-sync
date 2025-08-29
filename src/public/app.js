const $ = (id) => document.getElementById(id);
const LABELS = { ebay: 'eBay', shopify: 'Shopify' };
let config = { channels: ['ebay', 'shopify'], demoControls: false };

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function timeAgo(iso) {
  const seconds = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.hidden = true), 3500);
}

// What each channel holds after the run: the target if the write went through.
function heldQuantity(item, channel) {
  return item.writes.includes(channel) && !item.failed[channel] ? item.target : item.observed[channel];
}

function deltaText(item) {
  const parts = config.channels
    .filter((c) => item.deltas[c] !== 0)
    .map((c) => {
      const d = item.deltas[c];
      return `${LABELS[c]} <span class="${d < 0 ? 'neg' : 'pos'}">${d > 0 ? '+' : '−'}${Math.abs(d)}</span>`;
    });
  if (item.isNew) return `first sync, set to ${item.target}`;
  return parts.length ? parts.join(' · ') : '<span class="muted">no change</span>';
}

function result(item) {
  const failed = Object.keys(item.failed);
  if (failed.length) return `<span class="pill failed">write failed: ${failed.map((c) => LABELS[c]).join(', ')}</span>`;
  if (item.oversold) return `<span class="pill warn">oversold by ${item.oversold}</span>`;
  if (item.writes.length) return `<span class="pill ok">updated ${item.writes.map((c) => LABELS[c]).join(', ')}</span>`;
  return '<span class="muted">in sync</span>';
}

function render({ lastRun, history, running }) {
  const pill = $('status-pill');
  if (running) {
    pill.className = 'pill';
    pill.textContent = 'syncing…';
  } else if (lastRun) {
    pill.className = `pill ${lastRun.status}`;
    pill.textContent = { ok: 'in sync', partial: 'partial', failed: 'failed' }[lastRun.status];
  } else {
    pill.textContent = 'waiting for first run';
  }
  if (!lastRun) return;

  const counts = lastRun.counts ?? {};
  $('t-skus').textContent = counts.skus ?? '–';
  $('t-changed').textContent = counts.changed ?? '–';
  $('t-failed').textContent = counts.failedWrites ?? '–';
  $('t-unmatched').textContent = counts.unmatched ?? '–';
  $('last-run').textContent = `run ${lastRun.runId}, ${timeAgo(lastRun.finishedAt)}${lastRun.dryRun ? ' (dry run)' : ''}`;

  if (lastRun.status === 'failed' && lastRun.items.length === 0) {
    $('items').innerHTML = `<tr><td colspan="6" class="muted">Last run failed: ${esc(lastRun.error)}. Nothing was written.</td></tr>`;
  } else {
    $('items').innerHTML = lastRun.items
      .map(
        (item) => `<tr>
          <td class="sku">${esc(item.sku)}</td>
          ${config.channels.map((c) => `<td class="num">${heldQuantity(item, c)}</td>`).join('')}
          <td class="delta">${deltaText(item)}</td>
          <td>${result(item)}</td>
          <td class="demo-col" ${config.demoControls ? '' : 'hidden'}>
            ${config.channels.map((c) => `<button class="small" data-sell="${c}" data-sku="${esc(item.sku)}">Sell 1 on ${LABELS[c]}</button>`).join('')}
          </td>
        </tr>`,
      )
      .join('');
  }

  $('unmatched').innerHTML = lastRun.unmatched
    .map((u) => `<li><span class="sku">${esc(u.sku)}</span> is only on ${u.foundIn.map((c) => LABELS[c]).join(', ')}, so it isn't synced.</li>`)
    .join('');

  $('runs').innerHTML = history
    .map(
      (run) => `<tr>
        <td class="sku">${esc(run.runId)}</td>
        <td>${new Date(run.startedAt).toLocaleTimeString()}</td>
        <td>${esc(run.trigger)}</td>
        <td><span class="pill ${run.status}">${run.status}</span></td>
        <td class="num">${run.counts?.writes ?? '–'}</td>
        <td class="num">${run.counts?.failedWrites ?? '–'}</td>
        <td class="num">${run.durationMs} ms</td>
      </tr>`,
    )
    .join('');
}

async function refresh() {
  try {
    const res = await fetch('/api/status');
    render(await res.json());
  } catch {
    $('status-pill').textContent = 'service unreachable';
  }
}

$('sync-now').addEventListener('click', async (event) => {
  event.target.disabled = true;
  try {
    const res = await fetch('/api/sync', { method: 'POST' });
    const report = await res.json();
    toast(`Run ${report.runId}: ${report.status}, ${report.counts?.writes ?? 0} writes`);
  } finally {
    event.target.disabled = false;
    refresh();
  }
});

$('items').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-sell]');
  if (!button) return;
  const { sell: channel, sku } = button.dataset;
  const res = await fetch('/api/demo/sale', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ channel, sku, quantity: 1 }),
  });
  const body = await res.json();
  toast(res.ok ? `Sold 1 × ${sku} on ${LABELS[channel]} (${body.quantity} left there). The next sync carries it over.` : body.error);
});

(async () => {
  config = await (await fetch('/api/config')).json();
  document.querySelectorAll('.demo-col').forEach((el) => (el.hidden = !config.demoControls));
  const every = config.syncIntervalSeconds ? `syncs every ${config.syncIntervalSeconds}s` : 'manual sync only';
  $('subtitle').textContent = `${config.channels.map((c) => LABELS[c]).join(' ⇄ ')} · ${every}${config.dryRun ? ' · dry run' : ''}`;
  refresh();
  setInterval(refresh, 2000);
})();

function syncRecords(data) {
  if (!data) return null;
  return data;
}

function formatOutput(data) {
  if (!data) return null;
  return data;
}

function importData(data) {
  if (!data) return null;
  return data;
}

function destroySession(data) {
  if (!data) return null;
  return data;
}