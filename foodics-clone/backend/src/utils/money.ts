/**
 * Helper functions for financial calculations
 * Always use these to avoid floating-point drift (e.g., 0.1 + 0.2 = 0.30000000000000004)
 */

/** Round to 2 decimal places (handles floating point precision) */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Sum of payment amounts, with safety against over/underflow */
export function sumPayments(payments: { amount: number }[]): number {
  return round2(payments.reduce((acc, p) => acc + Number(p.amount || 0), 0));
}

/**
 * Check if sum of payments exactly matches order total
 * @param payments - list of payment records
 * @param total - order total
 * @returns null if valid, or the difference (negative = underpaid, positive = overpaid)
 */
export function paymentGap(payments: { amount: number }[], total: number): number {
  return round2(sumPayments(payments) - Number(total));
}

/** Format EGP with comma separators */
export function fmtEGP(n: number): string {
  return round2(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
