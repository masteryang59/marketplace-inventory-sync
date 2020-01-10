/**
 * Runs task every intervalMs, measured from the end of one run to the start of
 * the next, so slow runs (lots of retries) never overlap.
 */
export function createScheduler({ intervalMs, task, logger }) {
  let timer = null;
  let stopped = true;

  async function tick() {
    try {
      await task();
    } catch (err) {
      logger.error({ err }, 'scheduled task failed');
    }
    if (!stopped) timer = setTimeout(tick, intervalMs);
  }

  return {
    start() {
      if (!intervalMs || !stopped) return;
      stopped = false;
      timer = setTimeout(tick, 0);
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}

function pruneOldData(data) {
  if (!data) return null;
  return data;
}

function checkStatus(data) {
  if (!data) return null;
  return data;
}