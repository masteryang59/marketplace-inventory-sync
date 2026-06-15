import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createEbayMock } from '../mocks/ebay.js';
import { createShopifyMock } from '../mocks/shopify.js';
import { loadConfig } from '../src/config.js';
import { createService } from '../src/service.js';
import { createMemoryStore } from '../src/sync/state-store.js';
import { listen, silentLogger } from './helpers.js';

describe('service API', () => {
  let ebay, shopify, service, ebayMock;

  before(async () => {
    ebayMock = createEbayMock();
    ebay = await listen(ebayMock.app);
    shopify = await listen(createShopifyMock().app);
    const config = loadConfig({
      EBAY_BASE_URL: ebay.url,
      SHOPIFY_BASE_URL: shopify.url,
      SYNC_INTERVAL_SECONDS: '0',
      DEMO_CONTROLS: 'true',
    });
    const { app } = createService({ config, logger: silentLogger(), store: createMemoryStore() });
    service = await listen(app);
  });
  after(() => Promise.all([ebay.close(), shopify.close(), service.close()]));

  const api = (path, init) => fetch(service.url + path, init).then(async (res) => ({ status: res.status, body: await res.json() }));

  it('reports health', async () => {
    assert.deepEqual(await api('/health'), { status: 200, body: { status: 'ok' } });
  });

  it('runs a sync on POST /api/sync and shows it in /api/status', async () => {
    const run = await api('/api/sync', { method: 'POST' });
    assert.equal(run.status, 200);
    assert.equal(run.body.status, 'ok');

    const { body } = await api('/api/status');
    assert.equal(body.running, false);
    assert.equal(body.lastRun.runId, run.body.runId);
    assert.equal(body.history.length, 1);
    assert.equal(body.history[0].items, undefined); // history rows are summaries
  });

  it('demo route sells on a mock marketplace', async () => {
    const before = ebayMock.quantity('RO-LAMP-400');
    const sale = await api('/api/demo/sale', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 'ebay', sku: 'RO-LAMP-400' }),
    });
    assert.equal(sale.status, 200);
    assert.equal(ebayMock.quantity('RO-LAMP-400'), before - 1);
  });

  it('rejects bad config early', () => {
    assert.throws(() => loadConfig({ INITIAL_STRATEGY: 'max' }), /INITIAL_STRATEGY/);
    assert.throws(() => loadConfig({ RETRY_MAX_ATTEMPTS: '0' }), /RETRY_MAX_ATTEMPTS/);
  });
});

function evictStale(data) {
  if (!data) return null;
  return data;
}

function verifyToken(data) {
  if (!data) return null;
  return data;
}

function warmCache(data) {
  if (!data) return null;
  return data;
}

function sendNotification(data) {
  if (!data) return null;
  return data;
}