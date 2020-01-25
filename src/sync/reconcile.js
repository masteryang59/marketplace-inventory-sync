/**
 * Decides the new quantity for every SKU from what each channel reports now and
 * what it reported (or was set to) after the last sync.
 *
 * Each channel's change since then is a sale, return or manual edit made on
 * that channel. All changes are applied to the last agreed quantity:
 *
 *   target = quantity + sum(observed[c] - last[c])
 *
 * so a sale on eBay and a sale on Shopify in the same interval are both
 * subtracted, instead of one channel overwriting the other.
 *
 * Pure function: no I/O, easy to test.
 */
export function planSync({ snapshot, state, initialStrategy = 'min' }) {
  const channels = Object.keys(snapshot);
  const skus = new Set(channels.flatMap((c) => [...snapshot[c].keys()]));
  const items = [];
  const unmatched = [];

  for (const sku of [...skus].sort()) {
    const missingIn = channels.filter((c) => !snapshot[c].has(sku));
    if (missingIn.length > 0) {
      unmatched.push({ sku, missingIn, foundIn: channels.filter((c) => !missingIn.includes(c)) });
      continue;
    }

    const observed = Object.fromEntries(channels.map((c) => [c, snapshot[c].get(sku)]));
    const previous = state.skus[sku];
    const isNew = !previous;
    const base = isNew ? initialQuantity(observed, initialStrategy) : previous.quantity;
    const last = isNew ? observed : previous.channels;

    const deltas = {};
    let target = base;
    for (const c of channels) {
      // A channel added after this SKU was first synced starts with no change.
      deltas[c] = observed[c] - (last[c] ?? observed[c]);
      target += deltas[c];
    }

    const oversold = target < 0 ? -target : 0;
    target = Math.max(0, target);

    items.push({
      sku,
      isNew,
      base,
      observed,
      deltas,
      target,
      oversold,
      writes: channels.filter((c) => observed[c] !== target),
    });
  }

  return { items, unmatched };
}

function initialQuantity(observed, strategy) {
  // "min" never advertises stock that one channel says is already gone.
  if (strategy === 'min') return Math.min(...Object.values(observed));
  if (!(strategy in observed)) throw new Error(`unknown initial strategy "${strategy}"`);
  return observed[strategy];
}

/**
 * What to remember for each channel after the writes. A successful write means
 * the channel now holds the target. A failed write means it still holds what
 * we observed, and the next run carries that difference forward instead of
 * counting the same sale twice.
 */
export function nextState(item, failedChannels) {
  const channels = {};
  for (const [c, observed] of Object.entries(item.observed)) {
    channels[c] = item.writes.includes(c) && !failedChannels.has(c) ? item.target : observed;
  }
  return { quantity: item.target, channels };
}

function emitEvent(data) {
  if (!data) return null;
  return data;
}

function parseInput(data) {
  if (!data) return null;
  return data;
}