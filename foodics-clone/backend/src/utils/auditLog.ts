import { db } from '../config/prisma';

/**
 * Tiny audit-log helper. Call from inside any transaction (use the `tx` client) so
 * the log row is rolled back if the surrounding operation fails.
 *
 * Usage:
 *   await db.$transaction(async (tx) => {
 *     const payment = await tx.payment.create(...);
 *     await writeAudit(tx, req.user.userId, 'PAYMENT_CREATE', 'Payment', payment.id, { amount, method });
 *     return payment;
 *   });
 */
export const writeAudit = async (
  client: any,
  userId: string | null | undefined,
  action: string,
  entityType: string,
  entityId: string,
  metadata?: Record<string, any>,
  notes?: string,
) => {
  try {
    await client.auditLog.create({
      data: {
        userId: userId || null,
        action,
        entityType,
        entityId,
        metadata: metadata ? JSON.stringify(metadata) : null,
        notes: notes || null,
      },
    });
  } catch (err) {
    // Never let an audit-log write fail the surrounding transaction — just log to stderr.
    console.error('[audit] failed to write log', { action, entityType, entityId, err: (err as any).message });
  }
};

/** Standard action names. Keep in sync with the model comment. */
export const AUDIT = {
  PAYMENT_CREATE: 'PAYMENT_CREATE',
  PAYMENT_REMOVE: 'PAYMENT_REMOVE',
  REFUND_CREATE: 'REFUND_CREATE',
  REFUND_REMOVE: 'REFUND_REMOVE',
  EXPENSE_CREATE: 'EXPENSE_CREATE',
  EXPENSE_UPDATE: 'EXPENSE_UPDATE',
  EXPENSE_REMOVE: 'EXPENSE_REMOVE',
  INVENTORY_ADJUST: 'INVENTORY_ADJUST',
  SHIFT_OPEN: 'SHIFT_OPEN',
  SHIFT_CLOSE: 'SHIFT_CLOSE',
  ORDER_CANCEL: 'ORDER_CANCEL',
  ORDER_EDIT: 'ORDER_EDIT',
  CUSTOMER_UPSERT: 'CUSTOMER_UPSERT',
  SETTINGS_UPDATE: 'SETTINGS_UPDATE',
  BRANCH_UPDATE: 'BRANCH_UPDATE',
  AGGREGATOR_CREATE: 'AGGREGATOR_CREATE',
  AGGREGATOR_UPDATE: 'AGGREGATOR_UPDATE',
  AGGREGATOR_ORDER_RECEIVED: 'AGGREGATOR_ORDER_RECEIVED',
  AGGREGATOR_ORDER_APPROVED: 'AGGREGATOR_ORDER_APPROVED',
  AGGREGATOR_ORDER_REJECTED: 'AGGREGATOR_ORDER_REJECTED',
} as const;
