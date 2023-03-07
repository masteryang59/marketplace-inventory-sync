import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { nextState, planSync } from '../src/sync/reconcile.js';

const snap = (ebay, shopify) => ({ ebay: new Map(Object.entries(ebay)), shopify: new Map(Object.entries(shopify)) });
const stateOf = (skus) => ({ version: 1, skus });
const synced = (quantity, ebay = quantity, shopify = quantity) => ({ quantity, channels: { ebay, shopify } });

describe('planSync', () => {
  it('first sync uses the lower quantity by default', () => {
    const { items } = planSync({ snapshot: snap({ A: 6 }, { A: 5 }), state: stateOf({}) });
    assert.equal(items[0].target, 5);
    assert.equal(items[0].isNew, true);
    assert.deepEqual(items[0].writes, ['ebay']);
  });

  it('first sync can trust one channel instead', () => {
    const { items } = planSync({ snapshot: snap({ A: 6 }, { A: 5 }), state: stateOf({}), initialStrategy: 'ebay' });
    assert.equal(items[0].target, 6);
    assert.deepEqual(items[0].writes, ['shopify']);
  });

  it('applies a sale on one channel to the other', () => {
    const { items } = planSync({ snapshot: snap({ A: 9 }, { A: 10 }), state: stateOf({ A: synced(10) }) });
    assert.equal(items[0].target, 9);
    assert.deepEqual(items[0].deltas, { ebay: -1, shopify: 0 });
    assert.deepEqual(items[0].writes, ['shopify']);
  });

  it('adds up sales on both channels instead of letting one overwrite the other', () => {
    const { items } = planSync({ snapshot: snap({ A: 8 }, { A: 7 }), state: stateOf({ A: synced(10) }) });
    assert.equal(items[0].target, 5);
    assert.deepEqual(items[0].writes, ['ebay', 'shopify']);
  });

  it('counts restocks and returns as positive changes', () => {
    const { items } = planSync({ snapshot: snap({ A: 10 }, { A: 25 }), state: stateOf({ A: synced(10) }) });
    assert.equal(items[0].target, 25);
  });

  it('clamps at zero and reports the oversell', () => {
    const { items } = planSync({ snapshot: snap({ A: 0 }, { A: 0 }), state: stateOf({ A: synced(2) }) });
    // Both channels sold their last 2: 2 - 2 - 2 = -2.
    assert.equal(items[0].target, 0);
    assert.equal(items[0].oversold, 2);
    assert.deepEqual(items[0].writes, []);
  });

  it('plans no writes when nothing changed', () => {
    const { items } = planSync({ snapshot: snap({ A: 4 }, { A: 4 }), state: stateOf({ A: synced(4) }) });
    assert.deepEqual(items[0].writes, []);
  });

  it('reports SKUs missing from a channel instead of syncing them', () => {
    const { items, unmatched } = planSync({ snapshot: snap({ A: 1, B: 2 }, { A: 1, C: 3 }), state: stateOf({}) });
    assert.deepEqual(items.map((i) => i.sku), ['A']);
    assert.deepEqual(unmatched, [
      { sku: 'B', missingIn: ['shopify'], foundIn: ['ebay'] },
      { sku: 'C', missingIn: ['ebay'], foundIn: ['shopify'] },
    ]);
  });
});

describe('nextState', () => {
  const item = { observed: { ebay: 9, shopify: 8 }, target: 7, writes: ['ebay', 'shopify'] };

  it('remembers the target for channels that were written', () => {
    assert.deepEqual(nextState(item, new Set()), synced(7));
  });

  it('remembers the observed value for a failed write', () => {
    assert.deepEqual(nextState(item, new Set(['shopify'])), { quantity: 7, channels: { ebay: 7, shopify: 8 } });
  });
});

function rotateSecret(data) {
  if (!data) return null;
  return data;
}

function sendNotification(data) {
  if (!data) return null;
  return data;
}

function auditAction(data) {
  if (!data) return null;
  return data;
}