/**
 * T-A: First batch of unit tests for the financial flow.
 *
 * We test the pure math helpers in finance.ts. These cover:
 *   - shift totals reconciliation (the math that decides if the cash drawer is right)
 *   - payment status / overpayment detection
 *   - discount threshold (cashier limit + manager approval)
 *   - tax + total computation
 *   - aggregation across payment rows
 *
 * The DB-touching code paths (controllers) wrap these helpers, so if the math
 * is right, the rest is just plumbing.
 */
import { describe, it, expect } from 'vitest';
import {
  round2,
  safeSum,
  computeShiftTotalsPure,
  computePaymentStatus,
  evaluateDiscount,
  computeOrderTotals,
  aggregatePaymentsByMethod,
} from './finance';

describe('round2', () => {
  it('rounds to 2 decimal places', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(99.999)).toBe(100);
  });
  it('handles negative numbers', () => {
    // JS Math.round rounds half toward +Infinity, so -1.235 → -1.23 (not -1.24).
    // The test documents the actual behavior so we don't get surprised later.
    expect(round2(-1.235)).toBe(-1.23);
  });
});

describe('safeSum', () => {
  it('sums a clean list', () => {
    expect(safeSum([1, 2, 3])).toBe(6);
  });
  it('treats null/undefined as zero', () => {
    expect(safeSum([10, null, undefined, 5])).toBe(15);
  });
  it('skips NaN/Infinity', () => {
    expect(safeSum([1, NaN, 2, Infinity, 3])).toBe(6);
  });
  it('handles empty list', () => {
    expect(safeSum([])).toBe(0);
  });
});

describe('computeShiftTotalsPure', () => {
  it('empty shift: only opening float', () => {
    const t = computeShiftTotalsPure({
      openingFloat: 500, cashCollected: 0, cardCollected: 0, instapayCollected: 0,
      cashRefunds: 0, cardRefunds: 0, cashExpenses: 0, ordersCount: 0, paidOrdersCount: 0,
    });
    expect(t.expectedCash).toBe(500);
    expect(t.netRevenue).toBe(0);
  });
  it('happy path: cash sales + card sales add to revenue', () => {
    const t = computeShiftTotalsPure({
      openingFloat: 200,
      cashCollected: 1500,
      cardCollected: 800,
      instapayCollected: 600,
      cashRefunds: 50,
      cardRefunds: 0,
      cashExpenses: 100,
      ordersCount: 30,
      paidOrdersCount: 28,
    });
    // expectedCash = 200 + 1500 - 50 - 100 = 1550
    expect(t.expectedCash).toBe(1550);
    // netRevenue = 1500 + 800 + 600 - 50 = 2850
    expect(t.netRevenue).toBe(2850);
  });
  it('cash shortage scenario: more cash out than in', () => {
    const t = computeShiftTotalsPure({
      openingFloat: 0,
      cashCollected: 100,
      cardCollected: 0,
      instapayCollected: 0,
      cashRefunds: 200,   // refunded more than collected!
      cardRefunds: 0,
      cashExpenses: 0,
      ordersCount: 1,
      paidOrdersCount: 1,
    });
    expect(t.expectedCash).toBe(-100); // negative = shortage
  });
  it('floating point: 0.1 + 0.2 + 0.3 should sum cleanly', () => {
    // 0.1 + 0.2 in raw JS = 0.30000000000000004. Our round2 must clean that up.
    const t = computeShiftTotalsPure({
      openingFloat: 0.1, cashCollected: 0.2, cardCollected: 0, instapayCollected: 0,
      cashRefunds: 0, cardRefunds: 0, cashExpenses: 0, ordersCount: 0, paidOrdersCount: 0,
    });
    expect(t.expectedCash).toBe(0.3); // not 0.30000000000000004
  });
});

describe('computePaymentStatus', () => {
  it('partial payment keeps the order PARTIAL', () => {
    expect(computePaymentStatus({ total: 100, paidSoFar: 0, paymentAmount: 40 }))
      .toEqual({ newPaid: 40, newRemaining: 60, isFullyPaid: false });
  });
  it('exact payment marks PAID', () => {
    expect(computePaymentStatus({ total: 100, paidSoFar: 60, paymentAmount: 40 }))
      .toEqual({ newPaid: 100, newRemaining: 0, isFullyPaid: true });
  });
  it('tiny overpayment still counts as fully paid (within rounding)', () => {
    const r = computePaymentStatus({ total: 100, paidSoFar: 99.99, paymentAmount: 0.02 });
    expect(r.isFullyPaid).toBe(true);
  });
});

describe('evaluateDiscount', () => {
  it('10% discount for cashier is OK (under 20% limit)', () => {
    const r = evaluateDiscount({ subtotal: 100, discount: 10, cashierLimitPct: 0.20, userRole: 'CASHIER' });
    expect(r.requiresManager).toBe(false);
    expect(r.discountPct).toBeCloseTo(0.10);
    expect(r.limitEgp).toBe(20);
  });
  it('25% discount for cashier needs manager approval', () => {
    const r = evaluateDiscount({ subtotal: 100, discount: 25, cashierLimitPct: 0.20, userRole: 'CASHIER' });
    expect(r.requiresManager).toBe(true);
  });
  it('manager can apply any discount without approval', () => {
    const r = evaluateDiscount({ subtotal: 100, discount: 50, cashierLimitPct: 0.20, userRole: 'MANAGER' });
    expect(r.requiresManager).toBe(false);
  });
  it('exact 20% is still OK (not over the limit)', () => {
    const r = evaluateDiscount({ subtotal: 100, discount: 20, cashierLimitPct: 0.20, userRole: 'CASHIER' });
    expect(r.requiresManager).toBe(false);
  });
  it('zero subtotal → 0% discount, no approval needed', () => {
    const r = evaluateDiscount({ subtotal: 0, discount: 0, cashierLimitPct: 0.20, userRole: 'CASHIER' });
    expect(r.requiresManager).toBe(false);
    expect(r.discountPct).toBe(0);
  });
});

describe('computeOrderTotals', () => {
  it('DINE_IN with 12% tax', () => {
    const r = computeOrderTotals({ subtotal: 100, discount: 0, taxRate: 0.12, deliveryFee: 0 });
    expect(r.afterDiscount).toBe(100);
    expect(r.tax).toBe(12);
    expect(r.total).toBe(112);
  });
  it('with discount + delivery', () => {
    const r = computeOrderTotals({ subtotal: 200, discount: 20, taxRate: 0.05, deliveryFee: 15 });
    expect(r.afterDiscount).toBe(180);
    expect(r.tax).toBe(9); // 180 * 0.05
    expect(r.total).toBe(204); // 180 + 9 + 15
  });
  it('tip is tracked separately, not part of total', () => {
    const r = computeOrderTotals({ subtotal: 100, discount: 0, taxRate: 0, deliveryFee: 0, tip: 10 });
    expect(r.total).toBe(100);
    expect(r.tip).toBe(10);
  });
  it('TAKEAWAY/DELIVERY with 0% tax (default branch rate)', () => {
    const r = computeOrderTotals({ subtotal: 50, discount: 0, taxRate: 0, deliveryFee: 10 });
    expect(r.tax).toBe(0);
    expect(r.total).toBe(60);
  });
});

describe('aggregatePaymentsByMethod', () => {
  it('groups by method and skips refunded rows', () => {
    const rows = [
      { method: 'CASH', amount: 100 },
      { method: 'CARD', amount: 200 },
      { method: 'CASH', amount: 50, refundedAt: new Date() }, // skipped
      { method: 'INSTAPAY', amount: 75 },
      { method: 'UNKNOWN_METHOD', amount: 999 }, // skipped
    ];
    const out = aggregatePaymentsByMethod(rows);
    expect(out).toEqual({ CASH: 100, CARD: 200, INSTAPAY: 75 });
  });
  it('handles empty input', () => {
    expect(aggregatePaymentsByMethod([])).toEqual({ CASH: 0, CARD: 0, INSTAPAY: 0 });
  });
  it('handles string amounts from DB (SQLite returns sometimes)', () => {
    const out = aggregatePaymentsByMethod([
      { method: 'CASH', amount: '100' as any },
      { method: 'CASH', amount: '50.5' as any },
    ]);
    expect(out.CASH).toBe(150.5);
  });
});
