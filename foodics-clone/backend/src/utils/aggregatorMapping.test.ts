/**
 * Tests for the aggregator mapping helpers. Pure math, no DB.
 */
import { describe, it, expect } from 'vitest';
import {
  getPath, getAny, toNum, toInt, toStr, parseFieldMapping,
  normalizeOrder, verifyHmacSignature, DEFAULT_FIELD_MAPPING,
} from './aggregatorMapping';
import { createHmac } from 'crypto';

describe('getPath', () => {
  it('reads nested object via dot notation', () => {
    expect(getPath({ a: { b: { c: 42 } } }, 'a.b.c')).toBe(42);
  });
  it('returns undefined for missing path', () => {
    expect(getPath({ a: { b: 1 } }, 'a.b.c.d')).toBeUndefined();
    expect(getPath({}, 'x')).toBeUndefined();
    expect(getPath(null, 'x')).toBeUndefined();
  });
  it('handles empty path', () => {
    expect(getPath({ a: 1 }, '')).toBeUndefined();
  });
});

describe('getAny', () => {
  it('returns the first non-empty value across paths', () => {
    const obj = { a: undefined, b: null, c: 'found-it', d: 'later' };
    expect(getAny(obj, ['a', 'b', 'c', 'd'])).toBe('found-it');
  });
  it('returns undefined when all paths yield undefined', () => {
    expect(getAny({ a: 1 }, ['x', 'y'])).toBeUndefined();
  });
});

describe('toNum / toInt / toStr', () => {
  it('coerces various inputs to numbers', () => {
    expect(toNum('12.5')).toBe(12.5);
    expect(toNum(7)).toBe(7);
    expect(toNum(null)).toBe(0);
    expect(toNum(undefined)).toBe(0);
    expect(toNum('abc')).toBe(0);
    expect(toNum('abc', 99)).toBe(99);
  });
  it('coerces to positive integer with fallback', () => {
    expect(toInt(5)).toBe(5);
    expect(toInt('3')).toBe(3);
    expect(toInt(0)).toBe(1); // fallback
    expect(toInt(-2)).toBe(1); // fallback
    expect(toInt('abc')).toBe(1);
  });
  it('toStr handles null/undefined', () => {
    expect(toStr(null)).toBe('');
    expect(toStr(undefined)).toBe('');
    expect(toStr(0)).toBe('0');
    expect(toStr('hi')).toBe('hi');
  });
});

describe('parseFieldMapping', () => {
  it('returns defaults when raw is null/empty', () => {
    expect(parseFieldMapping(null)).toEqual(DEFAULT_FIELD_MAPPING);
    expect(parseFieldMapping('')).toEqual(DEFAULT_FIELD_MAPPING);
  });
  it('merges user mapping with defaults', () => {
    const out = parseFieldMapping(JSON.stringify({ externalOrderId: 'order_id' }));
    expect(out.externalOrderId).toBe('order_id'); // overridden
    expect(out.customerName).toBe(DEFAULT_FIELD_MAPPING.customerName); // default
  });
  it('returns defaults for bad JSON', () => {
    expect(parseFieldMapping('not json')).toEqual(DEFAULT_FIELD_MAPPING);
    expect(parseFieldMapping('null')).toEqual(DEFAULT_FIELD_MAPPING);
    expect(parseFieldMapping('[]')).toEqual(DEFAULT_FIELD_MAPPING);
  });
});

describe('normalizeOrder', () => {
  it('normalizes an Otlob-style payload using the default mapping', () => {
    const payload = {
      orderId: 'OTL-12345',
      customer: { name: 'محمد', phone: '01012345678', address: 'شارع 9، المعادي' },
      items: [
        { sku: 'P-1', name: 'برجر', quantity: 2, unitPrice: 95 },
        { sku: 'P-2', name: 'كولا', quantity: 1, unitPrice: 25 },
      ],
      subtotal: 215,
      deliveryFee: 25,
      total: 240,
      notes: 'بدون بصل',
    };
    const out = normalizeOrder(payload, DEFAULT_FIELD_MAPPING);
    expect(out.externalOrderId).toBe('OTL-12345');
    expect(out.customerName).toBe('محمد');
    expect(out.customerPhone).toBe('01012345678');
    expect(out.customerAddress).toBe('شارع 9، المعادي');
    expect(out.items).toHaveLength(2);
    expect(out.items[0].name).toBe('برجر');
    expect(out.items[0].quantity).toBe(2);
    expect(out.subtotal).toBe(215);
    expect(out.deliveryFee).toBe(25);
    expect(out.total).toBe(240);
    expect(out.notes).toBe('بدون بصل');
  });

  it('normalizes a Talabat-style payload (different field names)', () => {
    const payload = {
      reference: 'TAL-999',
      customer_name: 'أحمد',
      customer_phone: '01112223344',
      address: 'مدينة نصر',
      order_items: [
        { product_id: 'B-1', title: 'شاورما', qty: 3, price: 50 },
      ],
      sub_total: 150,
      shipping_fee: 20,
      grand_total: 170,
    };
    const mapping = {
      ...DEFAULT_FIELD_MAPPING,
      externalOrderId: 'reference',
      customerName: 'customer_name',
      customerPhone: 'customer_phone',
      customerAddress: 'address',
      items: 'order_items',
      itemSku: 'product_id',
      itemName: 'title',
      itemQuantity: 'qty',
      itemPrice: 'price',
      subtotal: 'sub_total',
      deliveryFee: 'shipping_fee',
      total: 'grand_total',
    };
    const out = normalizeOrder(payload, mapping);
    expect(out.externalOrderId).toBe('TAL-999');
    expect(out.customerName).toBe('أحمد');
    expect(out.items[0].name).toBe('شاورما');
    expect(out.items[0].quantity).toBe(3);
    expect(out.subtotal).toBe(150);
    expect(out.deliveryFee).toBe(20);
    expect(out.total).toBe(170);
  });

  it('handles missing customer address gracefully', () => {
    const payload = {
      orderId: 'X-1',
      customer: { name: 'Test', phone: '0100' },
      items: [],
      total: 0,
    };
    const out = normalizeOrder(payload, DEFAULT_FIELD_MAPPING);
    expect(out.customerAddress).toBe('');
    expect(out.items).toEqual([]);
    expect(out.total).toBe(0);
  });

  it('computes total from subtotal + deliveryFee when total is missing', () => {
    const payload = {
      orderId: 'X-2',
      customer: { name: 'A', phone: '0100' },
      items: [],
      subtotal: 100,
      deliveryFee: 20,
    };
    const out = normalizeOrder(payload, DEFAULT_FIELD_MAPPING);
    expect(out.total).toBe(120);
  });

  it('handles elmenus-style alternative field names (camelCase + snake_case mixed)', () => {
    const payload = {
      id: 'ELM-777',
      customer: { name: 'سارة', mobile: '01099998888' },
      items: [{ sku: 'X', item_name: 'فتة', count: 1, unit_price: 80 }],
    };
    const mapping = {
      ...DEFAULT_FIELD_MAPPING,
      externalOrderId: 'id',
      customerPhone: 'customer.mobile',
      itemName: 'item_name',
      itemQuantity: 'count',
    };
    const out = normalizeOrder(payload, mapping);
    expect(out.externalOrderId).toBe('ELM-777');
    expect(out.customerPhone).toBe('01099998888');
    expect(out.items[0].name).toBe('فتة');
    expect(out.items[0].quantity).toBe(1);
    expect(out.items[0].unitPrice).toBe(80);
  });
});

describe('verifyHmacSignature', () => {
  it('returns true when no secret is configured (dev mode)', () => {
    expect(verifyHmacSignature('body', 'whatever', null)).toBe(true);
    expect(verifyHmacSignature('body', undefined, '')).toBe(true);
  });
  it('returns false when secret is set but no signature header', () => {
    expect(verifyHmacSignature('body', undefined, 'secret')).toBe(false);
  });
  it('returns true for correct HMAC-SHA256 signature', () => {
    const body = JSON.stringify({ orderId: 'X' });
    const sig = 'sha256=' + createHmac('sha256', 'my-secret').update(body, 'utf8').digest('hex');
    expect(verifyHmacSignature(body, sig, 'my-secret')).toBe(true);
  });
  it('accepts bare hex (no "sha256=" prefix)', () => {
    const body = 'hello';
    const sig = createHmac('sha256', 's').update(body, 'utf8').digest('hex');
    expect(verifyHmacSignature(body, sig, 's')).toBe(true);
  });
  it('rejects tampered body', () => {
    const body = 'original';
    const sig = 'sha256=' + createHmac('sha256', 's').update(body, 'utf8').digest('hex');
    expect(verifyHmacSignature('tampered', sig, 's')).toBe(false);
  });
});
