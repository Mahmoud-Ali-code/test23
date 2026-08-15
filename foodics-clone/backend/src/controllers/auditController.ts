import { Request, Response } from 'express';
import { db } from '../config/prisma';

/**
 * Audit log read endpoint. Manager+ only — cashiers/waiters can only see their own
 * actions.
 *
 * GET /api/audit?action=PAYMENT_CREATE&entityType=Order&entityId=...&userId=...&from=&to=&limit=100&cursor=<id>
 *
 * P1.7: cursor-based pagination via the `cursor` query param. The caller passes the
 * `nextCursor` we returned to fetch the next page. Page size is capped at 500.
 */
export const auditController = {
  async list(req: any, res: Response) {
    const { action, entityType, entityId, userId, from, to, limit = '100', cursor } = req.query;
    const where: any = {};
    if (action) where.action = String(action);
    if (entityType) where.entityType = String(entityType);
    if (entityId) where.entityId = String(entityId);
    if (userId) where.userId = String(userId);
    if (req.user.role === 'CASHIER' || req.user.role === 'WAITER' || req.user.role === 'KITCHEN') {
      // Limit cashiers to their own actions
      where.userId = req.user.userId;
    }
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(String(from));
      if (to) where.createdAt.lte = new Date(String(to));
    }
    const take = Math.min(parseInt(String(limit)) || 100, 500);
    // We fetch `take + 1` to know if there's a next page without a separate count query
    const logs = await db.auditLog.findMany({
      where,
      include: { user: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: String(cursor) }, skip: 1 } : {}),
    });
    const hasMore = logs.length > take;
    const page = hasMore ? logs.slice(0, take) : logs;
    // P1.8: enrich the metadata with a humanized summary that the UI can show
    // without needing to fetch the full order/customer/payment.
    // We add an `entityRef` field with: { kind, ref, label } when we can resolve it.
    const enriched = await Promise.all(page.map(async (l) => {
      const meta = l.metadata ? safeParse(l.metadata) : null;
      const entityRef = await resolveEntityRef(l.entityType, l.entityId);
      return { ...l, metadata: meta, entityRef };
    }));
    return res.json({
      logs: enriched,
      count: enriched.length,
      hasMore,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  },
};

function safeParse(s: string): any {
  try { return JSON.parse(s); } catch { return s; }
}

/**
 * P1.8: resolve a (entityType, entityId) pair into something a human can read.
 * For Order/Payment/Refund/Customer we look up the friendly name (orderNumber, phone, etc.)
 * and return a `label` plus the raw id. The audit UI displays this in the row header
 * and in the metadata drawer so cashiers never see raw UUIDs.
 */
async function resolveEntityRef(entityType: string, entityId: string): Promise<{ kind: string; ref: string; label: string } | null> {
  try {
    if (entityType === 'Order') {
      const o = await db.order.findUnique({ where: { id: entityId }, select: { orderNumber: true, total: true } });
      if (o) return { kind: 'Order', ref: entityId, label: `أوردر #${o.orderNumber} (${Number(o.total).toFixed(2)} EGP)` };
    } else if (entityType === 'Payment') {
      const p = await db.payment.findUnique({
        where: { id: entityId },
        include: { order: { select: { orderNumber: true } } },
      });
      if (p) return { kind: 'Payment', ref: entityId, label: `دفعة #${p.id.slice(-6)} على أوردر #${p.order?.orderNumber}` };
    } else if (entityType === 'Refund') {
      const r = await db.refund.findUnique({
        where: { id: entityId },
        include: { order: { select: { orderNumber: true } } },
      });
      if (r) return { kind: 'Refund', ref: entityId, label: `استرداد ${Number(r.amount).toFixed(2)} EGP من أوردر #${r.order?.orderNumber}` };
    } else if (entityType === 'Customer') {
      const c = await db.customer.findUnique({ where: { id: entityId }, select: { name: true, phone: true } });
      if (c) return { kind: 'Customer', ref: entityId, label: `${c.name} (${c.phone})` };
    } else if (entityType === 'Shift') {
      const s = await db.shift.findUnique({ where: { id: entityId }, include: { user: { select: { name: true } } } });
      if (s) return { kind: 'Shift', ref: entityId, label: `شيفت ${s.user?.name || ''}` };
    } else if (entityType === 'Expense') {
      const e = await db.expense.findUnique({ where: { id: entityId }, select: { description: true, amount: true } });
      if (e) return { kind: 'Expense', ref: entityId, label: `${e.description} (${Number(e.amount).toFixed(2)} EGP)` };
    } else if (entityType === 'Inventory') {
      const inv = await db.inventory.findUnique({ where: { productId: entityId }, include: { product: { select: { nameAr: true, name: true } } } });
      if (inv) return { kind: 'Inventory', ref: entityId, label: inv.product?.nameAr || inv.product?.name || 'منتج' };
    } else if (entityType === 'Branch') {
      const b = await db.branch.findUnique({ where: { id: entityId }, select: { name: true, nameAr: true } });
      if (b) return { kind: 'Branch', ref: entityId, label: b.nameAr || b.name };
    } else if (entityType === 'Setting') {
      return { kind: 'Setting', ref: entityId, label: 'إعدادات النظام' };
    } else if (entityType === 'Aggregator') {
      const a = await db.aggregator.findUnique({ where: { id: entityId }, select: { name: true, code: true } });
      if (a) return { kind: 'Aggregator', ref: entityId, label: `${a.name} (${a.code})` };
    }
  } catch {}
  return null;
}
