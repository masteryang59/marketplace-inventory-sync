import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { createEbayMock } from '../mocks/ebay.js';
import { createFaults } from '../mocks/faults.js';
import { catalog } from '../mocks/seed.js';
import { createShopifyMock } from '../mocks/shopify.js';
import { createEbayChannel } from '../src/channels/ebay.js';
import { createShopifyChannel } from '../src/channels/shopify.js';
import { createHttpClient } from '../src/http/client.js';
import { createSyncEngine } from '../src/sync/engine.js';
import { createMemoryStore } from '../src/sync/state-store.js';
import { captureLogger, listen } from './helpers.js';

const RETRY = { maxAttempts: 4, baseMs: 10, maxMs: 50 };

/** Real HTTP between the sync and both mocks; only sleeping between retries is skipped. */
async function startStack({ ebayCatalog = catalog, shopifyCatalog = catalog, ebayToken, timeoutMs = 2000 } = {}) {
  const ebayMock = createEbayMock({ catalog: ebayCatalog, faults: createFaults({ slowMs: 300 }) });
  const shopifyMock = createShopifyMock({ catalog: shopifyCatalog });
  const [ebayServer, shopifyServer] = await Promise.all([listen(ebayMock.app), listen(shopifyMock.app)]);
  const { logger, lines } = captureLogger();
  const sleeps = [];
  const common = { timeoutMs, retry: RETRY, logger, sleepFn: async (ms) => sleeps.push(ms) };

  const ebay = createEbayChannel({
    http: createHttpClient({ ...common, name: 'ebay', baseUrl: ebayServer.url, headers: { authorization: `Bearer ${ebayToken ?? 'mock-ebay-token'}` } }),
    pageSize: 5,
  });
  const shopify = createShopifyChannel({
    http: createHttpClient({ ...common, name: 'shopify', baseUrl: shopifyServer.url, headers: { 'x-shopify-access-token': 'shpat_mock_token' } }),
    apiVersion: '2024-10',
    locationId: 1001,
    logger,
    pageSize: 3,
  });
  const engine = createSyncEngine({ channels: [ebay, shopify], store: createMemoryStore(), logger });

  return {
    ebayMock,
    shopifyMock,
    ebay,
    shopify,
    engine,
    lines,
    sleeps,
    close: () => Promise.all([ebayServer.close(), shopifyServer.close()]),
  };
}

const bothSides = catalog.filter((c) => c.ebay != null && c.shopify != null);

describe('sync against the mock marketplaces', () => {
  let stack;
  beforeEach(async () => {
    await stack?.close();
    stack = await startStack();
  });
  after(() => stack?.close());

  it('first sync pages through both APIs and settles every shared SKU', async () => {
    const report = await stack.engine.runOnce();
    assert.equal(report.status, 'ok');
    assert.equal(report.counts.skus, bothSides.length);
    assert.deepEqual(report.unmatched.map((u) => u.sku), ['RO-CHAIR-LITE', 'RO-GIFT-50']);
    for (const { sku, ebay, shopify } of bothSides) {
      const expected = Math.min(ebay, shopify);
      assert.equal(stack.ebayMock.quantity(sku), expected, `eBay ${sku}`);
      assert.equal(stack.shopifyMock.quantity(sku), expected, `Shopify ${sku}`);
    }
  });

  it('carries sales from each marketplace to the other', async () => {
    await stack.engine.runOnce();
    stack.ebayMock.sell('RO-TENT-2P', 2); // 14 -> 12
    stack.shopifyMock.sell('RO-TENT-2P', 1); // 14 -> 13
    stack.shopifyMock.sell('RO-JKT-RAIN-M', 3); // 11 -> 8

    const report = await stack.engine.runOnce();
    assert.equal(report.counts.changed, 2);
    assert.equal(stack.ebayMock.quantity('RO-TENT-2P'), 11);
    assert.equal(stack.shopifyMock.quantity('RO-TENT-2P'), 11);
    assert.equal(stack.ebayMock.quantity('RO-JKT-RAIN-M'), 8);
  });

  it('retries through rate limits and server errors', async () => {
    stack.ebayMock.faults.enqueue('rate_limit', 'server_error');
    stack.shopifyMock.faults.enqueue('rate_limit', 'server_error', 'server_error');

    const report = await stack.engine.runOnce();
    assert.equal(report.status, 'ok');
    const retries = stack.lines.filter((l) => l.msg === 'retrying request');
    assert.equal(retries.length, 5);
    assert.deepEqual(
      retries.filter((r) => r.channel === 'shopify').map((r) => r.status),
      [429, 503, 503],
    );
    // Shopify's 429 carries Retry-After: 1.0, so that wait is exactly 1s.
    const shopifyRateLimit = retries.find((r) => r.channel === 'shopify' && r.status === 429);
    assert.equal(shopifyRateLimit.delayMs, 1000);
    assert.ok(stack.sleeps.includes(1000));
  });

  it('gives up on a channel after maxAttempts and writes nothing anywhere', async () => {
    stack.shopifyMock.faults.enqueue(...Array(RETRY.maxAttempts).fill('server_error'));
    const report = await stack.engine.runOnce();
    assert.equal(report.status, 'failed');
    assert.equal(report.errors[0].channel, 'shopify');
    assert.equal(stack.ebayMock.quantity('RO-TENT-4P'), 6); // not lowered to Shopify's 5
  });
});

describe('http client edge cases', () => {
  it('retries a request that times out', async () => {
    const stack = await startStack({ timeoutMs: 100 });
    try {
      stack.ebayMock.faults.enqueue('slow');
      const report = await stack.engine.runOnce();
      assert.equal(report.status, 'ok');
      const failure = stack.lines.find((l) => l.msg === 'http request failed' && l.channel === 'ebay');
      assert.match(failure.reason, /timed out after 100 ms/);
    } finally {
      await stack.close();
    }
  });

  it('does not retry a rejected token', async () => {
    const stack = await startStack({ ebayToken: 'wrong' });
    try {
      const report = await stack.engine.runOnce();
      assert.equal(report.status, 'failed');
      assert.match(report.errors[0].error, /returned 401/);
      assert.equal(stack.lines.filter((l) => l.msg === 'retrying request' && l.channel === 'ebay').length, 0);
    } finally {
      await stack.close();
    }
  });
});

describe('eBay channel', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ sku: `SKU-${String(i).padStart(2, '0')}`, title: `Item ${i}`, ebay: 5, shopify: 5 }));
  let stack;
  before(async () => {
    stack = await startStack({ ebayCatalog: many, shopifyCatalog: many });
  });
  after(() => stack.close());

  it('splits bulk updates into batches of 25', async () => {
    await stack.ebay.fetchInventory();
    const result = await stack.ebay.setQuantities(many.map(({ sku }) => ({ sku, quantity: 2 })));
    assert.equal(result.succeeded.length, 30);
    const posts = stack.lines.filter((l) => l.msg === 'http request' && l.method === 'POST');
    assert.equal(posts.length, 2);
  });

  it('reports per-SKU failures from a partly failed bulk update', async () => {
    const result = await stack.ebay.setQuantities([
      { sku: 'SKU-00', quantity: 1 },
      { sku: 'NOT-LISTED', quantity: 1 },
    ]);
    assert.deepEqual(result.succeeded, ['SKU-00']);
    assert.deepEqual(result.failed, [{ sku: 'NOT-LISTED', error: 'SKU NOT-LISTED is not available in the system.' }]);
  });
});

describe('Shopify channel', () => {
  it('skips a SKU that two variants share', async () => {
    const dupes = [
      { sku: 'MUG', title: 'Mug', variant: 'Blue', ebay: 3, shopify: 3 },
      { sku: 'MUG', title: 'Mug', variant: 'Red', ebay: null, shopify: 4 },
      { sku: 'CUP', title: 'Cup', ebay: 2, shopify: 2 },
    ];
    const stack = await startStack({ ebayCatalog: dupes, shopifyCatalog: dupes });
    try {
      const quantities = await stack.shopify.fetchInventory();
      assert.deepEqual([...quantities.keys()], ['CUP']);
      assert.ok(stack.lines.some((l) => l.level === 'warn' && l.sku === 'MUG'));
    } finally {
      await stack.close();
    }
  });
});

function auditAction(data) {
  if (!data) return null;
  return data;
}

function maskPii(data) {
  if (!data) return null;
  return data;
}