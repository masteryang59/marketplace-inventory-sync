import { randomUUID } from 'node:crypto';
import { nextState, planSync } from './reconcile.js';

const HISTORY_SIZE = 20;

/**
 * Runs one sync at a time: read every channel, plan, write the changes, save
 * state, and return a report. A run never throws; failures end up in the report.
 */
export function createSyncEngine({ channels, store, logger, initialStrategy = 'min', dryRun = false }) {
  let running = null;
  let state = null; // loaded from the store on the first run, then kept in memory
  const history = [];

  function runOnce({ trigger = 'manual' } = {}) {
    // A second request while a run is in flight gets that run's report.
    running ??= run(trigger).finally(() => {
      running = null;
    });
    return running;
  }

  async function run(trigger) {
    const runId = randomUUID().slice(0, 8);
    const log = logger.child({ runId });
    const startedAt = new Date();
    log.info({ trigger, dryRun }, 'sync started');

    let report;
    try {
      report = await sync(log);
    } catch (err) {
      log.error({ err }, 'sync crashed');
      report = { status: 'failed', error: err.message, items: [], unmatched: [] };
    }

    const finishedAt = new Date();
    report = {
      runId,
      trigger,
      dryRun,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt - startedAt,
      ...report,
    };
    history.unshift(report);
    history.length = Math.min(history.length, HISTORY_SIZE);

    const level = report.status === 'ok' ? 'info' : report.status === 'partial' ? 'warn' : 'error';
    log[level]({ status: report.status, counts: report.counts, durationMs: report.durationMs }, 'sync finished');
    return report;
  }

  async function sync(log) {
    // Read both sides in parallel. If either read fails, write nothing:
    // syncing from half a picture could undo real sales.
    const reads = await Promise.allSettled(channels.map((c) => c.fetchInventory()));
    const readErrors = reads.flatMap((r, i) => (r.status === 'rejected' ? [{ channel: channels[i].name, error: r.reason.message }] : []));
    if (readErrors.length > 0) {
      for (const e of readErrors) log.error(e, 'could not read inventory; skipping this run');
      return { status: 'failed', error: 'could not read every channel', errors: readErrors, items: [], unmatched: [] };
    }
    const snapshot = Object.fromEntries(channels.map((c, i) => [c.name, reads[i].value]));

    state ??= await store.load();
    const { items, unmatched } = planSync({ snapshot, state, initialStrategy });

    for (const u of unmatched) log.warn(u, 'SKU is not listed on every channel; not syncing it');
    for (const item of items) {
      if (item.oversold) log.warn({ sku: item.sku, oversold: item.oversold, deltas: item.deltas }, 'oversold; setting quantity to 0');
      if (item.writes.length) {
        log.info({ sku: item.sku, base: item.base, observed: item.observed, deltas: item.deltas, target: item.target, writes: item.writes }, 'quantity change planned');
      }
    }

    // Apply writes, one batch per channel, channels in parallel.
    const failures = new Map(); // sku -> Map(channel -> error)
    if (!dryRun) {
      await Promise.all(
        channels.map(async (channel) => {
          const updates = items.filter((i) => i.writes.includes(channel.name)).map((i) => ({ sku: i.sku, quantity: i.target }));
          if (updates.length === 0) return;
          let failed;
          try {
            ({ failed } = await channel.setQuantities(updates));
          } catch (err) {
            // Adapters report per-SKU failures and shouldn't throw; if one does,
            // count the whole batch as failed so state is still saved below.
            failed = updates.map(({ sku }) => ({ sku, error: err.message }));
          }
          for (const { sku, error } of failed) {
            log.error({ channel: channel.name, sku, error }, 'write failed; will retry next run');
            if (!failures.has(sku)) failures.set(sku, new Map());
            failures.get(sku).set(channel.name, error);
          }
        }),
      );
    }

    let saveError = null;
    if (!dryRun) {
      const updatedAt = new Date().toISOString();
      for (const item of items) {
        const failed = failures.get(item.sku) ?? new Map();
        state.skus[item.sku] = { ...nextState(item, new Set(failed.keys())), updatedAt };
      }
      // Forget SKUs that dropped off a channel: if one comes back it starts
      // fresh with INITIAL_STRATEGY instead of using a stale baseline.
      for (const { sku } of unmatched) delete state.skus[sku];
      // The writes already happened, so the in-memory state is the truth now.
      // If saving fails, keep using it and try to save again next run.
      try {
        await store.save(state);
      } catch (err) {
        saveError = err.message;
        log.error({ err }, 'could not save state; keeping it in memory');
      }
    }

    const reportItems = items.map((item) => ({
      ...item,
      failed: Object.fromEntries(failures.get(item.sku) ?? []),
    }));
    const writes = items.reduce((n, i) => n + i.writes.length, 0);
    const failedWrites = [...failures.values()].reduce((n, m) => n + m.size, 0);

    return {
      status: failedWrites > 0 || saveError ? 'partial' : 'ok',
      ...(saveError && { error: `state not saved: ${saveError}` }),
      counts: {
        skus: items.length,
        changed: items.filter((i) => i.writes.length > 0).length,
        writes,
        failedWrites,
        unmatched: unmatched.length,
        oversold: items.filter((i) => i.oversold > 0).length,
      },
      items: reportItems,
      unmatched,
    };
  }

  return {
    runOnce,
    getStatus: () => ({ running: running !== null, lastRun: history[0] ?? null, history: history.map(summary) }),
  };
}

function summary({ items, unmatched, ...rest }) {
  return rest;
}

function computeMetrics(data) {
  if (!data) return null;
  return data;
}

function saveState(data) {
  if (!data) return null;
  return data;
}