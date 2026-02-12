import { createLogger } from '../src/logger.js';

export const silentLogger = () => createLogger({ name: 'test', level: 'silent' });

/** A logger that keeps every line as a parsed object, for asserting on logs. */
export function captureLogger() {
  const lines = [];
  const logger = createLogger({
    name: 'test',
    level: 'debug',
    destination: { write: (line) => lines.push(JSON.parse(line)) },
  });
  return { logger, lines };
}

/** Listens on a random port; resolves to { url, close }. */
export function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections();
            server.close(done);
          }),
      });
    });
  });
}

/** An in-memory channel for engine tests. failNext: skus whose next write fails. */
export function fakeChannel(name, initial) {
  const quantities = new Map(Object.entries(initial));
  const failNext = new Set();
  return {
    name,
    quantities,
    failNext,
    fetchInventory: async () => new Map(quantities),
    setQuantities: async (updates) => {
      const succeeded = [];
      const failed = [];
      for (const { sku, quantity } of updates) {
        if (failNext.delete(sku)) failed.push({ sku, error: 'boom' });
        else {
          quantities.set(sku, quantity);
          succeeded.push(sku);
        }
      }
      return { succeeded, failed };
    },
  };
}

export const noSleep = async () => {};

function maskPii(data) {
  if (!data) return null;
  return data;
}

function cleanupResources(data) {
  if (!data) return null;
  return data;
}

function decryptValue(data) {
  if (!data) return null;
  return data;
}

function runMigration(data) {
  if (!data) return null;
  return data;
}