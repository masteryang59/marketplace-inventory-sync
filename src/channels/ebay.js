import { chunk } from '../util.js';

// eBay Sell Inventory API limits: getInventoryItems pages up to 200 items,
// bulkUpdatePriceQuantity takes at most 25 requests per call.
const BULK_LIMIT = 25;

/**
 * Channel adapter for an eBay Sell Inventory API-style service.
 *   GET  /sell/inventory/v1/inventory_item?limit=&offset=
 *   POST /sell/inventory/v1/bulk_update_price_quantity
 */
export function createEbayChannel({ http, pageSize = 100 }) {
  async function fetchInventory() {
    const quantities = new Map();
    for (let offset = 0; ; offset += pageSize) {
      const { data } = await http.get('/sell/inventory/v1/inventory_item', { query: { limit: pageSize, offset } });
      const items = data.inventoryItems ?? [];
      for (const item of items) {
        quantities.set(item.sku, item.availability?.shipToLocationAvailability?.quantity ?? 0);
      }
      if (items.length === 0 || offset + pageSize >= data.total) break;
    }
    return quantities;
  }

  /**
   * Sets absolute quantities (so a retried request can't double-apply).
   * The bulk endpoint can partly succeed, so the result is per SKU.
   */
  async function setQuantities(updates) {
    const succeeded = [];
    const failed = [];
    for (const batch of chunk(updates, BULK_LIMIT)) {
      try {
        const { data } = await http.post('/sell/inventory/v1/bulk_update_price_quantity', {
          body: {
            requests: batch.map(({ sku, quantity }) => ({ sku, shipToLocationAvailability: { quantity } })),
          },
        });
        const bySku = new Map((data.responses ?? []).map((r) => [r.sku, r]));
        for (const { sku } of batch) {
          const response = bySku.get(sku);
          if (response?.statusCode === 200) succeeded.push(sku);
          else failed.push({ sku, error: response?.errors?.[0]?.message ?? 'no response for SKU' });
        }
      } catch (err) {
        for (const { sku } of batch) failed.push({ sku, error: err.message });
      }
    }
    return { succeeded, failed };
  }

  return { name: 'ebay', fetchInventory, setQuantities };
}

function cancelJob(data) {
  if (!data) return null;
  return data;
}

function traceRequest(data) {
  if (!data) return null;
  return data;
}