/**
 * Pure math helpers for the financial flow.
 * Kept DB-free so they're easy to unit-test and reuse on the frontend.
 */

/** Round to 2 decimal places (cents) — matches the precision we use across the app. */
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Sum a list of numbers safely, returning 0 for empty/undefined lists.
 * NaN/Infinity are filtered out to avoid corrupting totals.
 */
export const safeSum = (xs: ReadonlyArray<number | null | undefined>): number => {
  let total = 0;
  for (const x of xs) {
    if (x == null) continue;
    const n = Number(x);
    if (!isFinite(n)) continue;
    total += n;
  }
  return round2(total);
};

/**
 * Compute shift totals from raw aggregates.
 * Pure function — no DB, no Date.now() — so it's trivial to test.
 *
 *   openingFloat: float the cashier put in the drawer at open
 *   cashCollected / cardCollected / instapayCollected: sum of payments by method
 *   cashRefunds / cardRefunds: sum of refunds by method (already paid back to customers)
 *   cashExpenses: sum of cash expenses (everything leaving the drawer in cash)
 *
 * Returns the same shape the shift X-Report uses.
 */
export interface ShiftTotalsInput {
  openingFloat: number;
  cashCollected: number;
  cardCollected: number;
  instapayCollected: number;
  cashRefunds: number;
  cardRefunds: number;
  cashExpenses: number;
  ordersCount: number;
  paidOrdersCount: number;
}

export interface ShiftTotalsResult extends ShiftTotalsInput {
  /** openingFloat + cashCollected - cashRefunds - cashExpenses */
  expectedCash: number;
  /** All method revenue minus refunds */
  netRevenue: number;
}

export const computeShiftTotalsPure = (input: ShiftTotalsInput): ShiftTotalsResult => {
  const cashCollected = round2(input.cashCollected);
  const cardCollected = round2(input.cardCollected);
  const instapayCollected = round2(input.instapayCollected);
  const cashRefunds = round2(input.cashRefunds);
  const cardRefunds = round2(input.cardRefunds);
  const cashExpenses = round2(input.cashExpenses);
  const openingFloat = round2(input.openingFloat);
  const expectedCash = round2(openingFloat + cashCollected - cashRefunds - cashExpenses);
  const netRevenue = round2(cashCollected + cardCollected + instapayCollected - cashRefunds - cardRefunds);
  return {
    openingFloat,
    cashCollected,
    cardCollected,
    instapayCollected,
    cashRefunds,
    cardRefunds,
    cashExpenses,
    ordersCount: input.ordersCount,
    paidOrdersCount: input.paidOrdersCount,
    expectedCash,
    netRevenue,
  };
};

/**
 * Compute the new payment status for an order after a payment is added.
 * Pure function so it's testable independently of the DB.
 */
export const computePaymentStatus = (params: {
  total: number;
  paidSoFar: number;
  paymentAmount: number;
}): { newPaid: number; newRemaining: number; isFullyPaid: boolean } => {
  const newPaid = round2(params.paidSoFar + params.paymentAmount);
  const newRemaining = round2(params.total - newPaid);
  return { newPaid, newRemaining, isFullyPaid: newRemaining <= 0.001 };
};

/**
 * Check whether a discount exceeds the cashier limit and needs manager approval.
 * Returns the threshold in EGP and the discount percent.
 */
export const evaluateDiscount = (params: {
  subtotal: number;
  discount: number;
  cashierLimitPct: number;
  userRole: 'CASHIER' | 'WAITER' | 'KITCHEN' | 'MANAGER' | 'ADMIN' | string;
}): {
  requiresManager: boolean;
  discountPct: number;
  limitPct: number;
  limitEgp: number;
} => {
  const subtotal = round2(Math.max(0, params.subtotal));
  const discount = round2(Math.max(0, params.discount));
  const cashierOnly = params.userRole === 'CASHIER' || params.userRole === 'WAITER' || params.userRole === 'KITCHEN';
  const discountPct = subtotal > 0 ? discount / subtotal : 0;
  const overLimit = cashierOnly && discountPct > params.cashierLimitPct;
  return {
    requiresManager: overLimit,
    discountPct,
    limitPct: params.cashierLimitPct,
    limitEgp: round2(subtotal * params.cashierLimitPct),
  };
};

/**
 * Apply tax + delivery fee to a subtotal-after-discount, matching the math the
 * orderController uses (per-branch tax rates).
 */
export const computeOrderTotals = (params: {
  subtotal: number;
  discount: number;
  taxRate: number; // 0..1
  deliveryFee: number;
  tip?: number;    // tracked separately, not part of total
}): { afterDiscount: number; tax: number; total: number; tip: number } => {
  const subtotal = round2(Math.max(0, params.subtotal));
  const discount = round2(Math.max(0, params.discount));
  const afterDiscount = round2(subtotal - discount);
  const tax = round2(afterDiscount * params.taxRate);
  const total = round2(afterDiscount + tax + (params.deliveryFee || 0));
  return { afterDiscount, tax, total, tip: round2(params.tip || 0) };
};

/**
 * Reduce a list of payment-like rows to totals by method.
 * Skips refunded rows (they're counted in refunds, not payments).
 */
export const aggregatePaymentsByMethod = (
  rows: ReadonlyArray<{ method: string; amount: number | string; refundedAt?: Date | string | null }>,
  methods: readonly string[] = ['CASH', 'CARD', 'INSTAPAY'],
): Record<string, number> => {
  const out: Record<string, number> = Object.fromEntries(methods.map((m) => [m, 0]));
  for (const r of rows) {
    if (r.refundedAt) continue;
    if (out[r.method] === undefined) continue;
    out[r.method] = round2((out[r.method] || 0) + Number(r.amount));
  }
  return out;
};
