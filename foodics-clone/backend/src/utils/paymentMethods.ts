/**
 * Single source of truth for payment method names across the codebase.
 * SQLite doesn't support Prisma enums, so we use string constants + runtime
 * validation in every controller that accepts a `method` field.
 *
 * If you add a new method:
 *  1. Add it here
 *  2. Make sure every controller that accepts `method` uses `isValidMethod()`
 *  3. Add a display label in the frontend
 *  4. Add the value to the byMethod map in any report that breaks it down
 */
export const PAYMENT_METHODS = ['CASH', 'CARD', 'INSTAPAY'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Methods a refund can be issued in (CASH or STORE_CREDIT are the practical ones in-store). */
export const REFUND_METHODS = ['CASH', 'CARD', 'INSTAPAY', 'STORE_CREDIT'] as const;
export type RefundMethod = (typeof REFUND_METHODS)[number];

/** Methods a business expense can be paid in. */
export const EXPENSE_METHODS = ['CASH', 'CARD', 'INSTAPAY', 'BANK_TRANSFER', 'CHEQUE'] as const;
export type ExpenseMethod = (typeof EXPENSE_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'كاش',
  CARD: 'بطاقة',
  INSTAPAY: 'إنستاباي',
  WALLET: 'محفظة',
  VODAFONE_CASH: 'فودافون كاش',
  FAWRY: 'فوري',
  BANK_TRANSFER: 'تحويل بنكي',
  CHEQUE: 'شيك',
  STORE_CREDIT: 'رصيد متجر',
  OTHER: 'أخرى',
};

export const isValidPaymentMethod = (m: unknown): m is PaymentMethod =>
  typeof m === 'string' && (PAYMENT_METHODS as readonly string[]).includes(m);

export const isValidRefundMethod = (m: unknown): m is RefundMethod =>
  typeof m === 'string' && (REFUND_METHODS as readonly string[]).includes(m);

export const isValidExpenseMethod = (m: unknown): m is ExpenseMethod =>
  typeof m === 'string' && (EXPENSE_METHODS as readonly string[]).includes(m);
