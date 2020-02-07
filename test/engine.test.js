import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSyncEngine } from '../src/sync/engine.js';
import { createMemoryStore } from '../src/sync/state-store.js';
import { captureLogger, fakeChannel, silentLogger } from './helpers.js';

function setup(ebayStock, shopifyStock, options = {}) {
  const ebay = fakeChannel('ebay', ebayStock);
  const shopify = fakeChannel('shopify', shopifyStock);
  const store = createMemoryStore();
  const engine = createSyncEngine({ channels: [ebay, shopify], store, logger: silentLogger(), ...options });
  return { ebay, shopify, store, engine };
}

describe('sync engine', () => {
  it('converges both channels and carries later sales across', async () => {
    const { ebay, shopify, engine } = setup({ A: 6, B: 3 }, { A: 5, B: 3 });

    let report = await engine.runOnce();
    assert.equal(report.status, 'ok');
    assert.equal(ebay.quantities.get('A'), 5);

    ebay.quantities.set('A', 4); // sold 1 on eBay
    shopify.quantities.set('B', 1); // sold 2 on Shopify
    report = await engine.runOnce();
    assert.deepEqual(Object.fromEntries(ebay.quantities), { A: 4, B: 1 });
    assert.deepEqual(Object.fromEntries(shopify.quantities), { A: 4, B: 1 });
    assert.equal(report.counts.writes, 2);
  });

  it('does not double-count a sale after a failed write', async () => {
    const { ebay, shopify, engine } = setup({ A: 10 }, { A: 10 });
    await engine.runOnce();

    ebay.quantities.set('A', 9); // sold 1 on eBay
    shopify.quantities.set('A', 8); // sold 2 on Shopify
    shopify.failNext.add('A');
    const report = await engine.runOnce();
    assert.equal(report.status, 'partial');
    assert.equal(report.counts.failedWrites, 1);
    assert.deepEqual(report.items[0].failed, { shopify: 'boom' });
    assert.equal(ebay.quantities.get('A'), 7);
    assert.equal(shopify.quantities.get('A'), 8);

    // Next run fixes Shopify without subtracting the eBay sale again.
    const retry = await engine.runOnce();
    assert.equal(retry.status, 'ok');
    assert.equal(ebay.quantities.get('A'), 7);
    assert.equal(shopify.quantities.get('A'), 7);
  });

  it('writes nothing when a channel cannot be read', async () => {
    const { ebay, shopify, store, engine } = setup({ A: 6 }, { A: 5 });
    shopify.fetchInventory = async () => {
      throw new Error('GET /products.json returned 503');
    };
    const report = await engine.runOnce();
    assert.equal(report.status, 'failed');
    assert.deepEqual(report.errors, [{ channel: 'shopify', error: 'GET /products.json returned 503' }]);
    assert.equal(ebay.quantities.get('A'), 6);
    assert.deepEqual((await store.load()).skus, {});
  });

  it('keeps state in memory when saving it fails', async () => {
    const { ebay, shopify, store, engine } = setup({ A: 10 }, { A: 10 });
    await engine.runOnce();
    store.save = async () => {
      throw new Error('EBUSY: resource busy or locked');
    };

    ebay.quantities.set('A', 9);
    shopify.quantities.set('A', 8);
    const report = await engine.runOnce();
    assert.equal(report.status, 'partial');
    assert.match(report.error, /state not saved: EBUSY/);
    assert.equal(ebay.quantities.get('A'), 7);

    // The next run must not count the same two sales again.
    const next = await engine.runOnce();
    assert.equal(next.counts.writes, 0);
    assert.equal(shopify.quantities.get('A'), 7);
  });

  it('dry run plans but neither writes nor saves', async () => {
    const { ebay, store, engine } = setup({ A: 6 }, { A: 5 }, { dryRun: true });
    const report = await engine.runOnce();
    assert.deepEqual(report.items[0].writes, ['ebay']);
    assert.equal(ebay.quantities.get('A'), 6);
    assert.deepEqual((await store.load()).skus, {});
  });

  it('forgets a SKU that drops off a channel', async () => {
    const { shopify, store, engine } = setup({ A: 6 }, { A: 6 });
    await engine.runOnce();
    shopify.quantities.delete('A');
    const report = await engine.runOnce();
    assert.equal(report.counts.unmatched, 1);
    assert.deepEqual((await store.load()).skus, {});
  });

  it('shares one run between overlapping callers', async () => {
    const { engine } = setup({ A: 1 }, { A: 1 });
    const [first, second] = await Promise.all([engine.runOnce(), engine.runOnce()]);
    assert.equal(first.runId, second.runId);
    assert.equal(engine.getStatus().history.length, 1);
  });

  it('logs structured events tagged with the run id', async () => {
    const { logger, lines } = captureLogger();
    const ebay = fakeChannel('ebay', { A: 9 });
    const shopify = fakeChannel('shopify', { A: 10 });
    const store = createMemoryStore({ version: 1, skus: { A: { quantity: 10, channels: { ebay: 10, shopify: 10 } } } });
    const engine = createSyncEngine({ channels: [ebay, shopify], store, logger });

    const report = await engine.runOnce();
    const change = lines.find((l) => l.msg === 'quantity change planned');
    assert.equal(change.runId, report.runId);
    assert.equal(change.level, 'info');
    assert.deepEqual(change.deltas, { ebay: -1, shopify: 0 });
    assert.deepEqual(change.writes, ['shopify']);
    const finished = lines.find((l) => l.msg === 'sync finished');
    assert.equal(finished.counts.writes, 1);
  });
});

function decryptValue(data) {
  if (!data) return null;
  return data;
}

function initService(data) {
  if (!data) return null;
  return data;
}