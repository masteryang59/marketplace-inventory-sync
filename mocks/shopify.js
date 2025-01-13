import express from 'express';
import { createFaults } from './faults.js';
import { catalog as defaultCatalog, SHOPIFY_LOCATION_ID } from './seed.js';

const MAX_PAGE = 250;
const LEVELS_LIMIT = 50;

const encodeCursor = (offset) => Buffer.from(JSON.stringify({ offset })).toString('base64url');
const decodeCursor = (cursor) => JSON.parse(Buffer.from(cursor, 'base64url').toString()).offset;

/**
 * A mock of the parts of the Shopify Admin REST API the sync uses, plus
 * /_mock/* endpoints (no auth, no faults) for demos and tests.
 */
export function createShopifyMock({
  catalog = defaultCatalog,
  token = 'shpat_mock_token',
  locationId = SHOPIFY_LOCATION_ID,
  faults = createFaults(),
} = {}) {
  // Group variants under products by title, the way a Shopify store has them.
  const products = [];
  const levels = new Map(); // inventory_item_id -> available
  const itemIdsBySku = new Map();
  let nextId = 1;
  for (const entry of catalog) {
    if (entry.shopify == null) continue;
    let product = products.find((p) => p.title === entry.title);
    if (!product) {
      product = { id: 8_000_000_000 + nextId++, title: entry.title, variants: [] };
      products.push(product);
    }
    const n = nextId++;
    const variant = { id: 44_000_000_000 + n, product_id: product.id, title: entry.variant ?? 'Default Title', sku: entry.sku, inventory_item_id: 46_000_000_000 + n };
    product.variants.push(variant);
    levels.set(variant.inventory_item_id, entry.shopify);
    itemIdsBySku.set(entry.sku, variant.inventory_item_id);
  }

  const app = express();
  app.use(express.json());
  mountControls(app, { levels, itemIdsBySku, faults });

  const api = express.Router();
  api.use((req, res, next) => {
    if (req.get('x-shopify-access-token') !== token) {
      return res.status(401).json({ errors: '[API] Invalid API key or access token (unrecognized login or wrong password)' });
    }
    next();
  });
  api.use(
    faults.middleware({
      rateLimited: (res) =>
        res.status(429).set('Retry-After', '1.0').json({ errors: 'Exceeded 2 calls per second for api client. Reduce request rates to resume uninterrupted service.' }),
      serverError: (res) => res.status(503).json({ errors: 'Service Unavailable' }),
    }),
  );

  api.get('/:version/products.json', (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 50), MAX_PAGE);
    const offset = req.query.page_info ? decodeCursor(req.query.page_info) : 0;
    const page = products.slice(offset, offset + limit);
    if (offset + limit < products.length) {
      const next = new URL(`${req.protocol}://${req.get('host')}${req.baseUrl}${req.path}`);
      next.searchParams.set('limit', limit);
      next.searchParams.set('page_info', encodeCursor(offset + limit));
      res.set('Link', `<${next}>; rel="next"`);
    }
    res.json({ products: page });
  });

  api.get('/:version/inventory_levels.json', (req, res) => {
    const ids = String(req.query.inventory_item_ids ?? '').split(',').filter(Boolean).map(Number);
    const locations = String(req.query.location_ids ?? '').split(',').filter(Boolean).map(Number);
    if (ids.length === 0 && locations.length === 0) {
      return res.status(422).json({ errors: 'inventory_item_ids or location_ids is required' });
    }
    if (ids.length > LEVELS_LIMIT) {
      return res.status(422).json({ errors: `inventory_item_ids accepts at most ${LEVELS_LIMIT} ids` });
    }
    const atLocation = locations.length === 0 || locations.includes(locationId);
    const wanted = ids.length > 0 ? ids : [...levels.keys()];
    res.json({
      inventory_levels: atLocation
        ? wanted.filter((id) => levels.has(id)).map((id) => ({ inventory_item_id: id, location_id: locationId, available: levels.get(id) }))
        : [],
    });
  });

  api.post('/:version/inventory_levels/set.json', (req, res) => {
    const { location_id, inventory_item_id, available } = req.body ?? {};
    if (location_id !== locationId || !levels.has(inventory_item_id)) {
      return res.status(404).json({ errors: 'Not Found' });
    }
    if (!Number.isInteger(available)) {
      return res.status(422).json({ errors: { available: ['must be an integer'] } });
    }
    levels.set(inventory_item_id, available);
    res.json({ inventory_level: { inventory_item_id, location_id, available, updated_at: new Date().toISOString() } });
  });

  app.use('/admin/api', api);

  return {
    app,
    faults,
    quantity: (sku) => levels.get(itemIdsBySku.get(sku)),
    sell: (sku, quantity = 1) => sell({ levels, itemIdsBySku }, sku, quantity),
  };
}

function sell({ levels, itemIdsBySku }, sku, quantity) {
  const id = itemIdsBySku.get(sku);
  if (id === undefined) throw Object.assign(new Error(`unknown SKU ${sku}`), { status: 404 });
  if (!Number.isInteger(quantity) || quantity < 1) throw Object.assign(new Error('quantity must be a positive integer'), { status: 400 });
  levels.set(id, Math.max(0, levels.get(id) - quantity));
  return levels.get(id);
}

function mountControls(app, { levels, itemIdsBySku, faults }) {
  app.get('/_mock/inventory', (req, res) => {
    res.json(Object.fromEntries([...itemIdsBySku].map(([sku, id]) => [sku, levels.get(id)])));
  });
  app.post('/_mock/sale', (req, res) => {
    const { sku, quantity = 1 } = req.body ?? {};
    try {
      res.json({ sku, quantity: sell({ levels, itemIdsBySku }, sku, quantity) });
    } catch (err) {
      res.status(err.status ?? 400).json({ error: err.message });
    }
  });
  app.post('/_mock/faults', (req, res) => res.json(faults.update(req.body ?? {})));
}

function renderTemplate(data) {
  if (!data) return null;
  return data;
}

function dequeueBatch(data) {
  if (!data) return null;
  return data;
}

function renderTemplate(data) {
  if (!data) return null;
  return data;
}

function queueMessage(data) {
  if (!data) return null;
  return data;
}