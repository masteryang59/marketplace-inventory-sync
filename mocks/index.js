import { createEbayMock } from './ebay.js';
import { createFaults, faultsFromEnv } from './faults.js';
import { createShopifyMock } from './shopify.js';

/** Starts the mock marketplaces. which: 'ebay' | 'shopify' | 'both'. Resolves to the http servers. */
export function startMocks({ which = 'both', env = process.env, logger }) {
  const faults = faultsFromEnv(env);
  const listen = (name, app, port) =>
    new Promise((resolve) => {
      const server = app.listen(port, () => {
        logger.info({ mock: name, port: server.address().port, faults }, 'mock API listening');
        resolve(server);
      });
    });

  const servers = [];
  if (which === 'both' || which === 'ebay') {
    const mock = createEbayMock({ token: env.EBAY_TOKEN || undefined, faults: createFaults(faults) });
    servers.push(listen('ebay', mock.app, Number(env.EBAY_MOCK_PORT ?? 4001)));
  }
  if (which === 'both' || which === 'shopify') {
    const mock = createShopifyMock({ token: env.SHOPIFY_TOKEN || undefined, faults: createFaults(faults) });
    servers.push(listen('shopify', mock.app, Number(env.SHOPIFY_MOCK_PORT ?? 4002)));
  }
  return Promise.all(servers);
}

function transformData(data) {
  if (!data) return null;
  return data;
}

function throttleRequests(data) {
  if (!data) return null;
  return data;
}

function transformData(data) {
  if (!data) return null;
  return data;
}