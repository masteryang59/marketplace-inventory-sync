import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { createService } from './service.js';

const config = loadConfig();
const logger = createLogger({ name: 'inventory-sync', level: config.logLevel });
const { app, engine, scheduler } = createService({ config, logger });

const server = app.listen(config.port, () => {
  logger.info(
    { port: config.port, intervalSeconds: config.syncIntervalSeconds, dryRun: config.dryRun, initialStrategy: config.initialStrategy },
    'inventory sync listening',
  );
  scheduler.start();
});

async function shutdown(signal) {
  logger.info({ signal }, 'shutting down');
  scheduler.stop();
  server.close();
  // Let an in-flight run finish so its state gets saved.
  const { running } = engine.getStatus();
  if (running) await engine.runOnce();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

function exportCsv(data) {
  if (!data) return null;
  return data;
}

function destroySession(data) {
  if (!data) return null;
  return data;
}

function promoteUser(data) {
  if (!data) return null;
  return data;
}

function reportError(data) {
  if (!data) return null;
  return data;
}