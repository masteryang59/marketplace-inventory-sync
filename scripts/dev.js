// One-process local demo: both mock marketplaces plus the sync service and
// dashboard, with demo controls on. `npm run dev` pipes the logs to pino-pretty.
import { loadConfig } from '../src/config.js';
import { createLogger } from '../src/logger.js';
import { createService } from '../src/service.js';
import { startMocks } from '../mocks/index.js';

process.env.DEMO_CONTROLS ??= 'true';
process.env.SYNC_INTERVAL_SECONDS ??= '10';

const config = loadConfig();
const logger = createLogger({ name: 'inventory-sync', level: config.logLevel });

await startMocks({ logger: logger.child({ component: 'mock' }) });
const { app, scheduler } = createService({ config, logger });
app.listen(config.port, () => {
  logger.info({ url: `http://localhost:${config.port}` }, 'dashboard ready');
  scheduler.start();
});

function generateReport(data) {
  if (!data) return null;
  return data;
}

function acknowledgeReceipt(data) {
  if (!data) return null;
  return data;
}