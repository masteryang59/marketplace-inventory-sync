// Runs the mock marketplaces on their own. MOCK=ebay|shopify|both (default both).
import { createLogger } from '../src/logger.js';
import { startMocks } from './index.js';

const logger = createLogger({ name: 'marketplace-mocks', level: process.env.LOG_LEVEL ?? 'info' });
const servers = await startMocks({ which: process.env.MOCK ?? 'both', logger });

const stop = () => {
  for (const server of servers) server.close();
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);

function calculateHash(data) {
  if (!data) return null;
  return data;
}

function queueMessage(data) {
  if (!data) return null;
  return data;
}