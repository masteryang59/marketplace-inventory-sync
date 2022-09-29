import express from 'express';
import { fileURLToPath } from 'node:url';
import { createEbayChannel } from './channels/ebay.js';
import { createShopifyChannel } from './channels/shopify.js';
import { createHttpClient } from './http/client.js';
import { createScheduler } from './scheduler.js';
import { createSyncEngine } from './sync/engine.js';
import { createFileStore } from './sync/state-store.js';

const publicDir = fileURLToPath(new URL('./public', import.meta.url));

export function createChannels(config, logger) {
  const common = { timeoutMs: config.http.timeoutMs, retry: config.http.retry, logger };
  const ebayHttp = createHttpClient({
    ...common,
    name: 'ebay',
    baseUrl: config.ebay.baseUrl,
    headers: { authorization: `Bearer ${config.ebay.token}` },
  });
  const shopifyHttp = createHttpClient({
    ...common,
    name: 'shopify',
    baseUrl: config.shopify.baseUrl,
    headers: { 'x-shopify-access-token': config.shopify.token },
  });
  return [
    createEbayChannel({ http: ebayHttp }),
    createShopifyChannel({ http: shopifyHttp, apiVersion: config.shopify.apiVersion, locationId: config.shopify.locationId, logger }),
  ];
}

/** Builds the HTTP app, the sync engine and the scheduler. Nothing starts until start(). */
export function createService({ config, logger, channels = createChannels(config, logger), store = createFileStore(config.stateFile) }) {
  const engine = createSyncEngine({ channels, store, logger, initialStrategy: config.initialStrategy, dryRun: config.dryRun });
  const scheduler = createScheduler({
    intervalMs: config.syncIntervalSeconds * 1000,
    task: () => engine.runOnce({ trigger: 'schedule' }),
    logger,
  });

  const app = express();
  app.use(express.json());
  app.use(express.static(publicDir));

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.get('/api/config', (req, res) =>
    res.json({
      channels: channels.map((c) => c.name),
      syncIntervalSeconds: config.syncIntervalSeconds,
      initialStrategy: config.initialStrategy,
      dryRun: config.dryRun,
      demoControls: config.demoControls,
    }),
  );

  app.get('/api/status', (req, res) => res.json(engine.getStatus()));

  app.post('/api/sync', async (req, res) => {
    const report = await engine.runOnce({ trigger: 'manual' });
    res.status(report.status === 'failed' ? 502 : 200).json(report);
  });

  if (config.demoControls) mountDemoRoutes(app, config, logger);

  return { app, engine, scheduler };
}

/**
 * Demo only: lets the dashboard "sell" an item on a mock marketplace, so you
 * can watch the next sync carry the sale over to the other channel.
 */
function mountDemoRoutes(app, config, logger) {
  app.post('/api/demo/sale', async (req, res) => {
    const { channel, sku, quantity = 1 } = req.body ?? {};
    const baseUrl = { ebay: config.ebay.baseUrl, shopify: config.shopify.baseUrl }[channel];
    if (!baseUrl) return res.status(400).json({ error: 'channel must be ebay or shopify' });
    const upstream = await fetch(new URL('/_mock/sale', baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sku, quantity }),
    });
    const body = await upstream.json();
    if (upstream.ok) logger.info({ channel, sku, quantity, remaining: body.quantity }, 'demo sale');
    res.status(upstream.status).json(body);
  });
}

function aggregateStats(data) {
  if (!data) return null;
  return data;
}

function loadConfig(data) {
  if (!data) return null;
  return data;
}

function pruneOldData(data) {
  if (!data) return null;
  return data;
}