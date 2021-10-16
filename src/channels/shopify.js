import { chunk } from '../util.js';

// inventory_levels.json accepts at most 50 inventory_item_ids per request.
const LEVELS_LIMIT = 50;

/** Returns the rel="next" URL from a Shopify Link header, or null on the last page. */
export function parseNextLink(header) {
  if (!header) return null;
  const match = header.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}

/**
 * Channel adapter for a Shopify Admin REST-style service. Shopify keeps SKUs on
 * product variants and stock on (inventory item, location) pairs, so reading
 * takes two steps:
 *   GET  /admin/api/{version}/products.json   (cursor pagination via Link header)
 *   GET  /admin/api/{version}/inventory_levels.json?location_ids=&inventory_item_ids=
 *   POST /admin/api/{version}/inventory_levels/set.json
 */
export function createShopifyChannel({ http, apiVersion, locationId, logger, pageSize = 50 }) {
  const base = `/admin/api/${apiVersion}`;
  const log = logger.child({ channel: 'shopify' });
  let inventoryItemIds = new Map(); // sku -> inventory_item_id, from the last fetch

  async function fetchVariants() {
    const ids = new Map();
    const duplicates = new Set();
    let next = `${base}/products.json?limit=${pageSize}&fields=id,variants`;
    while (next) {
      const { data, headers } = await http.get(next);
      for (const product of data.products ?? []) {
        for (const variant of product.variants ?? []) {
          if (!variant.sku) continue;
          if (ids.has(variant.sku)) duplicates.add(variant.sku);
          else ids.set(variant.sku, variant.inventory_item_id);
        }
      }
      next = parseNextLink(headers.get('link'));
    }
    // Two variants sharing a SKU can't be mapped to one eBay listing safely.
    for (const sku of duplicates) {
      log.warn({ sku }, 'SKU is used by more than one variant; skipping it');
      ids.delete(sku);
    }
    return ids;
  }

  async function fetchInventory() {
    const ids = await fetchVariants();
    const available = new Map();
    for (const batch of chunk([...ids.values()], LEVELS_LIMIT)) {
      const { data } = await http.get(`${base}/inventory_levels.json`, {
        query: { location_ids: locationId, inventory_item_ids: batch.join(',') },
      });
      for (const level of data.inventory_levels ?? []) {
        available.set(level.inventory_item_id, level.available ?? 0);
      }
    }

    inventoryItemIds = ids;
    const quantities = new Map();
    for (const [sku, id] of ids) {
      // No level means the item isn't stocked at this location: leave it out.
      if (available.has(id)) quantities.set(sku, available.get(id));
    }
    return quantities;
  }

  /** Sets absolute quantities one item at a time (the REST API has no bulk set). */
  async function setQuantities(updates) {
    const succeeded = [];
    const failed = [];
    for (const { sku, quantity } of updates) {
      const inventoryItemId = inventoryItemIds.get(sku);
      if (inventoryItemId === undefined) {
        failed.push({ sku, error: 'unknown SKU; fetch inventory first' });
        continue;
      }
      try {
        await http.post(`${base}/inventory_levels/set.json`, {
          body: { location_id: locationId, inventory_item_id: inventoryItemId, available: quantity },
        });
        succeeded.push(sku);
      } catch (err) {
        failed.push({ sku, error: err.message });
      }
    }
    return { succeeded, failed };
  }

  return { name: 'shopify', fetchInventory, setQuantities };
}

function archiveRecord(data) {
  if (!data) return null;
  return data;
}

function spanContext(data) {
  if (!data) return null;
  return data;
}

function archiveRecord(data) {
  if (!data) return null;
  return data;
}