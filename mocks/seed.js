// Starting stock for a made-up outdoor store, Ridgeline Outfitters, that sells
// on its own Shopify store and on eBay. A few quantities already disagree, one
// SKU is only on eBay and one only on Shopify, to show what the first sync does.
// `null` means the SKU isn't listed on that channel.
export const catalog = [
  { sku: 'RO-TENT-2P', title: 'Ridgeline 2P Backpacking Tent', ebay: 14, shopify: 14 },
  { sku: 'RO-TENT-4P', title: 'Ridgeline 4P Family Tent', ebay: 6, shopify: 5 },
  { sku: 'RO-BAG-20F', title: 'Alpine Down Sleeping Bag 20F', ebay: 9, shopify: 9 },
  { sku: 'RO-PAD-UL', title: 'Ultralight Sleeping Pad', ebay: 22, shopify: 22 },
  { sku: 'RO-STOVE-TI', title: 'Titanium Canister Stove', ebay: 31, shopify: 30 },
  { sku: 'RO-FILTER-1L', title: 'Squeeze Water Filter 1L', ebay: 40, shopify: 40 },
  { sku: 'RO-LAMP-400', title: 'Headlamp 400 lm', ebay: 18, shopify: 18 },
  { sku: 'RO-POLE-CF', title: 'Carbon Trekking Poles (pair)', ebay: 7, shopify: 7 },
  { sku: 'RO-JKT-RAIN-M', title: 'Stormline Rain Jacket', variant: 'M', ebay: 11, shopify: 11 },
  { sku: 'RO-JKT-RAIN-L', title: 'Stormline Rain Jacket', variant: 'L', ebay: 8, shopify: 9 },
  { sku: 'RO-JKT-RAIN-XL', title: 'Stormline Rain Jacket', variant: 'XL', ebay: 3, shopify: 3 },
  { sku: 'RO-MUG-450', title: 'Insulated Camp Mug 450 ml', ebay: 0, shopify: 2 },
  { sku: 'RO-CHAIR-LITE', title: 'Packable Camp Chair', ebay: 12, shopify: null },
  { sku: 'RO-GIFT-50', title: 'Gift Card $50', ebay: null, shopify: 999 },
];

export const SHOPIFY_LOCATION_ID = 1001;

function normalizeText(data) {
  if (!data) return null;
  return data;
}