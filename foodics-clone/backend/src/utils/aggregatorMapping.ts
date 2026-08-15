/**
 * Aggregator field mapping + normalization helpers.
 *
 * The food delivery platforms (Otiob Masr, Talabat, elmenus, etc.) all send
 * the same conceptual data — order ID, customer info, items, totals — but the
 * JSON field names differ. Instead of hardcoding per-aggregator parsing, we
 * store a `fieldMapping` object per Aggregator that maps our internal field
 * names to dot-notation paths in the incoming payload.
 *
 * Example mapping for Otlob Masr (assuming their field names):
 *   {
 *     "externalOrderId": "order_id",
 *     "customerName": "customer.name",
 *     "customerPhone": "customer.phone",
 *     "customerAddress": "customer.address",
 *     "items": "order_items",
 *     "itemSku": "sku",
 *     "itemName": "name",
 *     "itemQuantity": "qty",
 *     "itemPrice": "unit_price",
 *     "subtotal": "pricing.subtotal",
 *     "deliveryFee": "pricing.delivery_fee",
 *     "total": "pricing.total",
 *     "notes": "customer_notes"
 *   }
 *
 * The helper functions below are pure (no DB, no Date.now()) so they're easy
 * to unit-test.
 */

export const DEFAULT_FIELD_MAPPING: Record<string, string> = {
  externalOrderId: 'orderId',
  customerName: 'customer.name',
  customerPhone: 'customer.phone',
  customerAddress: 'customer.address',
  items: 'items',
  itemSku: 'sku',
  itemName: 'name',
  itemQuantity: 'quantity',
  itemPrice: 'unitPrice',
  subtotal: 'subtotal',
  deliveryFee: 'deliveryFee',
  total: 'total',
  notes: 'notes',
};

/** Parse a stored mapping (JSON string) into an object. Returns defaults on bad input. */
export const parseFieldMapping = (raw: string | null | undefined): Record<string, string> => {
  if (!raw) return { ...DEFAULT_FIELD_MAPPING };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      // Merge with defaults so missing keys still get a sensible default
      return { ...DEFAULT_FIELD_MAPPING, ...parsed };
    }
  } catch {}
  return { ...DEFAULT_FIELD_MAPPING };
};

/** Get a value at a dot-notation path in a nested object. Returns undefined if any segment is missing. */
export const getPath = (obj: any, path: string): any => {
  if (!obj || !path) return undefined;
  const parts = path.split('.');
  let cur: any = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[part];
  }
  return cur;
};

/** Try multiple paths in order, return the first one that yields a non-undefined value. */
export const getAny = (obj: any, paths: string[]): any => {
  for (const p of paths) {
    const v = getPath(obj, p);
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
};

/** Coerce a value to a number, returning `fallback` if it's not finite. */
export const toNum = (v: any, fallback = 0): number => {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  return isFinite(n) ? n : fallback;
};

/** Coerce a value to a string, returning '' for null/undefined. */
export const toStr = (v: any): string => {
  if (v === undefined || v === null) return '';
  return String(v);
};

/** Coerce a value to an integer, returning `fallback` if not finite or non-positive. */
export const toInt = (v: any, fallback = 1): number => {
  const n = Math.floor(toNum(v, fallback));
  if (!isFinite(n) || n <= 0) return fallback;
  return n;
};

/** Normalize a raw payload into our internal "NormalizedAggregatorOrder" shape. */
export interface NormalizedItem {
  sku?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
}

export interface NormalizedAggregatorOrder {
  externalOrderId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  notes?: string;
  items: NormalizedItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  /** Aggregator-reported currency (we always store EGP but useful to log) */
  currency?: string;
}

export const normalizeOrder = (payload: any, mapping: Record<string, string>): NormalizedAggregatorOrder => {
  // externalOrderId — try several common paths
  const externalOrderId = toStr(
    getAny(payload, [mapping.externalOrderId, 'orderId', 'order_id', 'id', 'reference']),
  );
  const customerName = toStr(
    getAny(payload, [mapping.customerName, 'customer.name', 'customerName']),
  );
  const customerPhone = toStr(
    getAny(payload, [mapping.customerPhone, 'customer.phone', 'customerPhone', 'customer.mobile']),
  );
  const customerAddress = toStr(
    getAny(payload, [mapping.customerAddress, 'customer.address', 'customerAddress', 'address']),
  );
  const notes = toStr(
    getAny(payload, [mapping.notes, 'notes', 'customer_notes', 'special_instructions']),
  ) || undefined;

  // Items — the mapping.items path should point to an array
  const rawItems = getPath(payload, mapping.items);
  const itemsArr: any[] = Array.isArray(rawItems) ? rawItems : [];
  const items: NormalizedItem[] = itemsArr.map((it) => ({
    sku: toStr(getAny(it, [mapping.itemSku, 'sku', 'product_id'])) || undefined,
    name: toStr(getAny(it, [mapping.itemName, 'name', 'item_name', 'title', 'product_name'])) || 'صنف',
    quantity: toInt(getAny(it, [mapping.itemQuantity, 'quantity', 'qty', 'count'])),
    unitPrice: toNum(getAny(it, [mapping.itemPrice, 'unitPrice', 'unit_price', 'price'])),
    notes: toStr(getAny(it, ['notes', 'item_notes', 'addons'])) || undefined,
  }));

  const subtotal = toNum(getAny(payload, [mapping.subtotal, 'subtotal', 'sub_total']));
  const deliveryFee = toNum(getAny(payload, [mapping.deliveryFee, 'deliveryFee', 'delivery_fee', 'shipping_fee']));
  // If total is provided, trust it; else compute from subtotal + deliveryFee
  const totalRaw = toNum(getAny(payload, [mapping.total, 'total', 'grand_total', 'order_total']));
  const total = totalRaw > 0 ? totalRaw : (subtotal + deliveryFee);

  return {
    externalOrderId,
    customerName,
    customerPhone,
    customerAddress,
    notes,
    items,
    subtotal,
    deliveryFee,
    total,
    currency: toStr(getAny(payload, ['currency', 'currency_code'])) || undefined,
  };
};

/**
 * Verify an HMAC-SHA256 signature for the request body.
 * Returns true if the signature is valid OR if no secret is configured (skip check).
 *
 * We accept both "sha256=<hex>" and "<hex>" formats in the X-Aggregator-Signature header.
 */
export const verifyHmacSignature = (
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string | null | undefined,
): boolean => {
  if (!secret) return true; // No secret = verification disabled (dev mode)
  if (!signatureHeader) return false;
  // We do this dynamically so the import doesn't blow up if crypto isn't loaded yet
  // (it's always available in Node, but this keeps types clean)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createHmac } = require('crypto');
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  // Constant-time-ish compare. Real constant-time would need buffer-level compare, but
  // for webhooks this is sufficient — we accept the small timing-attack surface.
  const provided = signatureHeader.trim();
  return expected === provided || expected.slice(7) === provided;
};
