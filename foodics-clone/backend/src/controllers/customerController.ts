import { Request, Response } from 'express';
import { db } from '../config/prisma';
import { getParam } from '../utils/params';
import { writeAudit, AUDIT } from '../utils/auditLog';

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Normalize a phone string to its last 10 digits. Egyptian numbers all start
 * with the same country code (20) so a 10-digit suffix uniquely identifies a
 * customer across formats (+201234567890, 00201234567890, 01234567890, "0123
 * 4567 890", etc.). This lets the search and find-or-create paths match
 * regardless of how the phone was typed in.
 */
const normalizePhone = (s: string | null | undefined): string => {
  if (!s) return '';
  const digits = String(s).replace(/\D+/g, '');
  return digits.slice(-10);
};

/**
 * Customer management for delivery orders + debt tracking.
 *
 * Linking rules:
 *  - On order create, if customerPhone is provided AND type === 'DELIVERY',
 *    we look up (or create) a Customer record and link the order to it.
 *  - When the order's paidAmount is updated (pay, addPayment, cancel, refund),
 *    the customer's outstanding / totalSpent / ordersCount / lastOrderAt are
 *    re-synced in the same transaction.
 *
 * Listing:
 *  - GET /api/customers with `outstanding=true` returns everyone with a positive
 *    outstanding balance (the "debt list" for collection).
 */
export const customerController = {
  /** GET /api/customers?outstanding=true&search=&limit=50&cursor=<id>
   *
   * P1.7: cursor-based pagination. We fetch `limit + 1` to detect more rows.
   * The 5 most-recent orders are still inlined so the list cards stay useful. */
  async list(req: Request, res: Response) {
    const { outstanding, search, limit = '50', cursor } = req.query;
    const where: any = { isActive: true };
    if (outstanding === 'true') where.outstanding = { gt: 0 };
    if (search) {
      const raw = String(search);
      const normalizedDigits = normalizePhone(raw);
      // B-4: name is fuzzy (contains); phone matches the last 10 digits only,
      // so a stray "12" in the search box doesn't pull every customer whose
      // phone happens to contain "12" anywhere.
      const orClauses: any[] = [{ name: { contains: raw } }];
      if (normalizedDigits.length >= 3) {
        orClauses.push({ phone: { contains: normalizedDigits } });
      } else if (raw) {
        // Short / non-numeric input still searches by name only (phone needs ≥3 digits
        // to avoid pathological matches like "1" pulling half the database).
        // No additional phone clause added.
      }
      where.OR = orClauses;
    }
    const take = Math.min(parseInt(String(limit)) || 50, 200);
    const customers = await db.customer.findMany({
      where,
      include: {
        _count: { select: { orders: true } },
        orders: { select: { id: true, orderNumber: true, total: true, paidAmount: true, createdAt: true, status: true }, orderBy: { createdAt: 'desc' }, take: 5 },
      },
      orderBy: [{ outstanding: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: String(cursor) }, skip: 1 } : {}),
    });
    const hasMore = customers.length > take;
    const page = hasMore ? customers.slice(0, take) : customers;
    const totalOutstanding = round2(page.reduce((s, c) => s + c.outstanding, 0));
    return res.json({
      customers: page,
      count: page.length,
      totalOutstanding,
      hasMore,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  },

  /** GET /api/customers/:id */
  async get(req: Request, res: Response) {
    const id = getParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const customer = await db.customer.findUnique({
      where: { id },
      include: {
        orders: { include: { items: { include: { product: true } }, payments: true, refunds: true }, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!customer) return res.status(404).json({ error: 'العميل غير موجود' });
    return res.json({ customer });
  },

  /** POST /api/customers */
  async create(req: any, res: Response) {
    const { name, phone, address, notes, branchId } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ error: 'الاسم ورقم الهاتف مطلوبان' });
    }
    // P2.2: wrap the "find or create + audit" in a transaction so a concurrent
    // create with the same phone can't produce two customers. Without the transaction
    // both reads return null, both writes succeed, and we end up with duplicates.
    const result = await db.$transaction(async (tx) => {
      const existing = await tx.customer.findUnique({ where: { phone: String(phone) } });
      if (existing) {
        return { customer: existing, existed: true };
      }
      const customer = await tx.customer.create({
        data: {
          name: String(name),
          phone: String(phone),
          address: address || null,
          notes: notes || null,
          branchId: branchId || null,
        },
      });
      // P0.2: audit log inside the same tx
      await writeAudit(tx, req.user?.userId, AUDIT.CUSTOMER_UPSERT, 'Customer', customer.id, {
        action: 'create',
        name: customer.name,
        phone: customer.phone,
      });
      return { customer, existed: false };
    });
    if (result.existed) {
      return res.json({ customer: result.customer, existed: true });
    }
    return res.status(201).json({ customer: result.customer });
  },

  /** PUT /api/customers/:id */
  async update(req: any, res: Response) {
    const id = getParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const { name, phone, address, notes, isActive } = req.body;
    const customer = await db.customer.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(address !== undefined ? { address } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
    });
    // P0.2: audit log
    await writeAudit(db, req.user?.userId, AUDIT.CUSTOMER_UPSERT, 'Customer', customer.id, {
      action: 'update',
      changes: Object.keys(req.body || {}),
    });
    return res.json({ customer });
  },

  /** DELETE /api/customers/:id (manager+ only) — soft delete */
  async remove(req: any, res: Response) {
    if (req.user.role === 'CASHIER' || req.user.role === 'WAITER' || req.user.role === 'KITCHEN') {
      return res.status(403).json({ error: 'غير مسموح لك بحذف عميل' });
    }
    const id = getParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    await db.customer.update({ where: { id }, data: { isActive: false } });
    return res.json({ message: 'تم تعطيل العميل' });
  },

  /** GET /api/customers/debt — debt collection list */
  async debtList(req: Request, res: Response) {
    const customers = await db.customer.findMany({
      where: { isActive: true, outstanding: { gt: 0 } },
      include: {
        orders: { where: { paymentStatus: { in: ['UNPAID', 'PARTIAL'] } }, select: { id: true, orderNumber: true, total: true, paidAmount: true, createdAt: true, status: true }, orderBy: { createdAt: 'desc' } },
      },
      orderBy: { outstanding: 'desc' },
    });
    const totalOwed = round2(customers.reduce((s, c) => s + c.outstanding, 0));
    return res.json({ customers, count: customers.length, totalOwed });
  },
};

/**
 * Helper: re-sync a customer's totals after their order's paidAmount changes.
 * Call this inside a `db.$transaction` so partial updates can't drift.
 *
 * - outstanding = Σ(order.total) - Σ(order.paidAmount) for active orders
 * - totalSpent   = Σ(order.paidAmount) across all orders (even CANCELLED, since money was once paid)
 * - ordersCount  = number of orders (all statuses)
 * - lastOrderAt  = max(order.createdAt)
 */
export const syncCustomerTotals = async (tx: any, customerId: string) => {
  if (!customerId) return;
  const orders = await tx.order.findMany({
    where: { customerId },
    select: { total: true, paidAmount: true, createdAt: true },
  });
  const outstanding = round2(orders.reduce((s, o) => s + (o.total - o.paidAmount), 0));
  const totalSpent = round2(orders.reduce((s, o) => s + o.paidAmount, 0));
  const ordersCount = orders.length;
  const lastOrderAt = orders.length
    ? orders.reduce((max, o) => (o.createdAt > max ? o.createdAt : max), orders[0].createdAt)
    : null;
  await tx.customer.update({
    where: { id: customerId },
    data: { outstanding, totalSpent, ordersCount, lastOrderAt },
  });
};

/**
 * Find or create a Customer by phone. Returns the customer id (or null if no phone given).
 * Used by order create flow for DELIVERY orders.
 */
export const findOrCreateCustomer = async (tx: any, name: string, phone: string, address?: string | null, branchId?: string | null) => {
  if (!phone) return null;
  const existing = await tx.customer.findUnique({ where: { phone: String(phone) } });
  if (existing) {
    // Optionally update name/address if provided and the existing record has blanks
    const updates: any = {};
    if (name && !existing.name) updates.name = name;
    if (address && !existing.address) updates.address = address;
    if (Object.keys(updates).length) {
      return (await tx.customer.update({ where: { id: existing.id }, data: updates })).id;
    }
    return existing.id;
  }
  const created = await tx.customer.create({
    data: {
      name: name || `عميل ${phone}`,
      phone: String(phone),
      address: address || null,
      branchId: branchId || null,
    },
  });
  return created.id;
};
