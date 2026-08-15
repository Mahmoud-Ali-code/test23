import { Request, Response } from 'express';
import { db } from '../config/prisma';
import { getParam } from '../utils/params';
import { writeAudit, AUDIT } from '../utils/auditLog';
import { comparePassword } from '../utils/jwt';
import {
  parseFieldMapping, normalizeOrder, verifyHmacSignature, DEFAULT_FIELD_MAPPING,
  NormalizedItem,
} from '../utils/aggregatorMapping';
import { syncCustomerTotals } from './customerController';
import { getTaxRate, generateOrderNumber } from './orderController';
import { round2 } from '../utils/finance';

const DEFAULT_USER_ID_FOR_AGGREGATOR_ORDERS: string | null = null;

/**
 * Aggregator integration controller.
 *
 * Flow:
 *   1. Aggregator sends POST /api/webhooks/aggregators/:code
 *   2. We verify HMAC (if secret configured) and log the raw request
 *   3. Normalize the payload using the aggregator's field mapping
 *   4. Look up (or create) the Customer by phone
 *   5. Try to map each item to a Product (by SKU first, then by name)
 *   6. Create the Order with status=PENDING, aggregatorAction='NONE'
 *   7. Cashier sees the order in /aggregator-orders and clicks approve/reject
 *
 * The whole flow is wrapped so failures don't lose the original request — we
 * store the raw payload in AggregatorWebhookLog regardless of the outcome.
 */
export const aggregatorController = {
  /**
   * PUBLIC webhook receiver. No auth — the HMAC signature (if configured) is
   * our authentication. Returns 200 with the order ID on success, or 4xx with
   * an error message on failure.
   */
  async webhook(req: any, res: Response) {
    const code = getParam(req.params.code);
    if (!code) return res.status(400).json({ error: 'Aggregator code required' });

    // Capture raw body + headers for the log. Use the rawBody captured by the
    // express.json `verify` callback (preserved byte-for-byte for HMAC).
    const rawBody: string = (req as any).rawBody
      ? (req as any).rawBody.toString('utf8')
      : (typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));
    const sigHeader = req.header('X-Aggregator-Signature') || req.header('X-Signature');

    // Look up aggregator
    const aggregator = await db.aggregator.findUnique({ where: { code } });

    // Log the incoming request (always, even if aggregator doesn't exist)
    const start = Date.now();
    const baseLogData: any = {
      aggregatorId: aggregator?.id || null,
      aggregatorCode: code,
      payload: rawBody.slice(0, 50_000), // cap at 50K to avoid runaway rows
      headers: JSON.stringify({
        signature: sigHeader,
        contentType: req.header('Content-Type'),
        userAgent: req.header('User-Agent'),
      }),
      ip: req.ip || req.headers['x-forwarded-for'] || null,
    };

    try {
      if (!aggregator) {
        await db.aggregatorWebhookLog.create({
          data: { ...baseLogData, status: 'FAILED', error: `Aggregator not found for code: ${code}` },
        });
        return res.status(404).json({ error: 'Aggregator not configured' });
      }
      if (!aggregator.isActive) {
        await db.aggregatorWebhookLog.create({
          data: { ...baseLogData, status: 'IGNORED', error: 'Aggregator is disabled' },
        });
        return res.status(403).json({ error: 'Aggregator is disabled' });
      }

      // HMAC verify
      if (!verifyHmacSignature(rawBody, sigHeader, aggregator.webhookSecret)) {
        await db.aggregatorWebhookLog.create({
          data: { ...baseLogData, status: 'FAILED', error: 'Invalid or missing signature' },
        });
        return res.status(401).json({ error: 'Invalid signature' });
      }

      // Parse + normalize
      const payload = typeof req.body === 'string' ? safeParseJson(rawBody) : (req.body || {});
      const mapping = parseFieldMapping(aggregator.fieldMapping);
      const normalized = normalizeOrder(payload, mapping);

      if (!normalized.externalOrderId) {
        await db.aggregatorWebhookLog.create({
          data: { ...baseLogData, status: 'FAILED', error: 'Could not extract externalOrderId from payload' },
        });
        return res.status(400).json({ error: 'Missing order identifier in payload' });
      }
      if (normalized.items.length === 0) {
        await db.aggregatorWebhookLog.create({
          data: { ...baseLogData, status: 'FAILED', error: 'No items in payload' },
        });
        return res.status(400).json({ error: 'Order has no items' });
      }
      if (!normalized.customerPhone) {
        await db.aggregatorWebhookLog.create({
          data: { ...baseLogData, status: 'FAILED', error: 'Missing customer phone' },
        });
        return res.status(400).json({ error: 'Missing customer phone' });
      }

      // Idempotency: if (aggregatorId, externalOrderId) already exists, return the existing order
      const existing = await db.order.findUnique({
        where: { aggregatorId_externalOrderId: { aggregatorId: aggregator.id, externalOrderId: normalized.externalOrderId } },
      });
      if (existing) {
        await db.aggregatorWebhookLog.create({
          data: {
            ...baseLogData,
            status: 'IGNORED',
            orderId: existing.id,
            externalOrderId: normalized.externalOrderId,
            error: 'Duplicate (already processed)',
          },
        });
        return res.status(200).json({ orderId: existing.id, duplicate: true });
      }

      // Try to match items to products (by SKU first, then by name)
      const matchedItems = await matchItems(normalized.items);
      const unmatched = matchedItems.filter((m) => !m.productId);

      // Compute totals from matched items (server-side, never trust aggregator price)
      let subtotal = 0;
      const orderItemsData: any[] = [];
      for (const m of matchedItems) {
        if (!m.productId) continue;
        const lineTotal = round2(m.unitPrice * m.quantity);
        subtotal += lineTotal;
        orderItemsData.push({
          productId: m.productId,
          quantity: m.quantity,
          price: m.unitPrice,
          notes: m.notes || null,
        });
      }
      // If aggregator sent a subtotal but it's wildly off, use our own. Otherwise trust theirs.
      // (In MVP we always recompute to be safe — protects against bad payloads.)
      const ourSubtotal = subtotal;
      const deliveryFee = round2(normalized.deliveryFee);
      const branchId = aggregator.branchId || (await db.branch.findFirst())?.id;
      if (!branchId) {
        await db.aggregatorWebhookLog.create({
          data: { ...baseLogData, status: 'FAILED', error: 'No branch configured for this aggregator' },
        });
        return res.status(500).json({ error: 'No branch configured' });
      }
      const taxRate = await getTaxRate(branchId, 'DELIVERY');
      const tax = round2(ourSubtotal * taxRate);
      const total = round2(ourSubtotal + tax + deliveryFee);

      // Customer link (find or create)
      const customerId = await findOrCreateCustomerByPhone(
        normalized.customerName, normalized.customerPhone, normalized.customerAddress, branchId,
      );

      // Generate order number
      const orderNumber = await generateOrderNumber();

      // Create the order
      const order = await db.order.create({
        data: {
          orderNumber,
          status: 'PENDING',
          type: 'DELIVERY',
          customerName: normalized.customerName,
          customerPhone: normalized.customerPhone,
          customerAddress: normalized.customerAddress,
          customerId,
          notes: normalized.notes,
          subtotal: ourSubtotal,
          tax,
          discount: 0,
          deliveryFee,
          total,
          branchId,
          // Webhook-created orders aren't tied to a logged-in user. We use the
          // aggregator's createdById (the admin who set it up) so audit logs
          // and reports still attribute the action. Fall back to the first admin.
          userId: aggregator.createdById || await getFirstAdminId() || (await db.user.findFirst())?.id,
          aggregatorId: aggregator.id,
          externalOrderId: normalized.externalOrderId,
          aggregatorPayload: rawBody.slice(0, 100_000),
          aggregatorAction: 'NONE',
          items: { create: orderItemsData },
        },
      });

      // Update the webhook log with success
      await db.aggregatorWebhookLog.create({
        data: {
          ...baseLogData,
          status: 'PROCESSED',
          orderId: order.id,
          externalOrderId: normalized.externalOrderId,
          processingMs: Date.now() - start,
        },
      });

      // Audit
      await writeAudit(db, aggregator.createdById, AUDIT.AGGREGATOR_ORDER_RECEIVED, 'Order', order.id, {
        aggregatorCode: aggregator.code,
        aggregatorName: aggregator.name,
        externalOrderId: normalized.externalOrderId,
        itemsCount: orderItemsData.length,
        unmatchedItemsCount: unmatched.length,
        total,
        customerPhone: normalized.customerPhone,
      });

      return res.status(201).json({
        orderId: order.id,
        orderNumber: order.orderNumber,
        itemsMatched: orderItemsData.length,
        itemsUnmatched: unmatched.length,
        total,
        requiresApproval: true,
      });
    } catch (err: any) {
      await db.aggregatorWebhookLog.create({
        data: {
          ...baseLogData,
          status: 'FAILED',
          error: err.message || String(err),
          processingMs: Date.now() - start,
        },
      });
      console.error('[aggregator webhook] error', err);
      return res.status(500).json({ error: err.message || 'Internal error' });
    }
  },

  /**
   * Admin: list all aggregators
   */
  async list(req: any, res: Response) {
    const aggregators = await db.aggregator.findMany({
      include: {
        branch: { select: { id: true, name: true, nameAr: true } },
        createdBy: { select: { id: true, name: true } },
        _count: { select: { orders: true, webhookLogs: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    // Don't expose the webhook secret in the list view — return it as "configured: true/false"
    return res.json({
      aggregators: aggregators.map((a) => ({
        ...a,
        webhookSecret: a.webhookSecret ? '••••••••' : null,
        hasSecret: !!a.webhookSecret,
      })),
    });
  },

  /**
   * Admin: create aggregator
   */
  async create(req: any, res: Response) {
    const { name, code, webhookSecret, fieldMapping, branchId, isActive } = req.body;
    if (!name || !code) return res.status(400).json({ error: 'الاسم والـ code مطلوبان' });

    // Validate code is URL-safe
    if (!/^[a-z0-9_-]+$/i.test(code)) {
      return res.status(400).json({ error: 'الـ code لازم يكون حروف إنجليزية وأرقام و - _ بس' });
    }

    // Use provided mapping (or defaults)
    const mapping = fieldMapping && typeof fieldMapping === 'object'
      ? { ...DEFAULT_FIELD_MAPPING, ...fieldMapping }
      : DEFAULT_FIELD_MAPPING;

    const agg = await db.aggregator.create({
      data: {
        name,
        code: code.toLowerCase(),
        webhookSecret: webhookSecret || null,
        fieldMapping: JSON.stringify(mapping),
        branchId: branchId || null,
        isActive: isActive !== false,
        createdById: req.user.userId,
      },
    });
    await writeAudit(db, req.user.userId, AUDIT.AGGREGATOR_CREATE, 'Aggregator', agg.id, {
      code: agg.code, name: agg.name, hasSecret: !!webhookSecret,
    });
    return res.status(201).json({ aggregator: { ...agg, hasSecret: !!webhookSecret, webhookSecret: null } });
  },

  /**
   * Admin: update aggregator (mapping, secret, active flag, etc.)
   */
  async update(req: any, res: Response) {
    const id = getParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const existing = await db.aggregator.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'المنصة غير موجودة' });

    const allowed: any = {};
    const { name, webhookSecret, fieldMapping, branchId, isActive } = req.body || {};
    if (name !== undefined) allowed.name = String(name).trim();
    if (branchId !== undefined) allowed.branchId = branchId || null;
    if (isActive !== undefined) allowed.isActive = !!isActive;
    if (webhookSecret !== undefined) {
      // Allow clearing the secret by passing empty string
      allowed.webhookSecret = webhookSecret ? String(webhookSecret) : null;
    }
    if (fieldMapping !== undefined) {
      const mapping = fieldMapping && typeof fieldMapping === 'object'
        ? { ...DEFAULT_FIELD_MAPPING, ...fieldMapping }
        : DEFAULT_FIELD_MAPPING;
      allowed.fieldMapping = JSON.stringify(mapping);
    }

    if (Object.keys(allowed).length === 0) {
      return res.status(400).json({ error: 'لا يوجد حقول قابلة للتحديث' });
    }

    const before = { ...existing, webhookSecret: existing.webhookSecret ? '••••' : null };
    const updated = await db.aggregator.update({ where: { id }, data: allowed });
    await writeAudit(db, req.user.userId, AUDIT.AGGREGATOR_UPDATE, 'Aggregator', id, {
      before: { name: before.name, isActive: before.isActive, hasSecret: !!before.webhookSecret, branchId: before.branchId },
      after: { name: updated.name, isActive: updated.isActive, hasSecret: !!updated.webhookSecret, branchId: updated.branchId },
    });
    return res.json({
      aggregator: {
        ...updated,
        webhookSecret: updated.webhookSecret ? '••••••••' : null,
        hasSecret: !!updated.webhookSecret,
      },
    });
  },

  /**
   * Admin: delete aggregator (soft — set isActive=false)
   */
  async remove(req: any, res: Response) {
    const id = getParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    await db.aggregator.update({ where: { id }, data: { isActive: false } });
    await writeAudit(db, req.user.userId, AUDIT.AGGREGATOR_UPDATE, 'Aggregator', id, { softDeleted: true });
    return res.json({ message: 'تم إلغاء تفعيل المنصة' });
  },

  /**
   * Public-ish: list orders pending aggregator approval (for cashier/kitchen view).
   * Anyone authenticated can see this — cashiers need to be able to approve.
   */
  async pendingOrders(req: any, res: Response) {
    const { aggregatorId, limit = '50' } = req.query as any;
    const where: any = {
      aggregatorId: { not: null },
      aggregatorAction: 'NONE',
      status: 'PENDING',
    };
    if (aggregatorId) where.aggregatorId = String(aggregatorId);
    const orders = await db.order.findMany({
      where,
      include: {
        items: { include: { product: { select: { id: true, name: true, nameAr: true } } } },
        aggregator: { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(200, parseInt(limit as string) || 50),
    });
    return res.json({ orders: orders.map(decorateAggregatorOrder) });
  },

  /**
   * Cashier: approve a pending aggregator order.
   * Moves status to CONFIRMED, deducts inventory, and links to the customer.
   */
  async approve(req: any, res: Response) {
    const id = getParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const order = await db.order.findUnique({
      where: { id },
      include: { items: true, payments: true },
    });
    if (!order) return res.status(404).json({ error: 'الأوردر غير موجود' });
    if (order.aggregatorAction !== 'NONE' || !order.aggregatorId) {
      return res.status(400).json({ error: 'الأوردر ده مش aggregator أو اتاخد قرار عليه بالفعل' });
    }
    if (order.status === 'CANCELLED') {
      return res.status(400).json({ error: 'الأوردر ملغي' });
    }

    // Transaction: confirm + deduct inventory + audit + customer sync
    const updated = await db.$transaction(async (tx) => {
      const o = await tx.order.update({
        where: { id },
        data: {
          status: 'CONFIRMED',
          aggregatorAction: 'APPROVED',
          aggregatorActionById: req.user.userId,
          aggregatorActionAt: new Date(),
        },
      });
      // Deduct inventory (only now — at approval time, not at receive time)
      for (const item of order.items) {
        if (!item.productId) continue;
        const inv = await tx.inventory.findUnique({ where: { productId: item.productId } });
        if (inv) {
          await tx.inventory.update({
            where: { productId: item.productId },
            data: { stock: { decrement: item.quantity } },
          });
          await tx.inventoryMovement.create({
            data: { type: 'OUT', quantity: item.quantity, reason: `Aggregator order ${order.orderNumber} approved`, productId: item.productId },
          });
        }
        const recipes = await tx.recipe.findMany({ where: { productId: item.productId } });
        for (const r of recipes) {
          const totalQty = r.quantity * item.quantity;
          await tx.ingredient.update({ where: { id: r.ingredientId }, data: { stock: { decrement: totalQty } } });
          await tx.inventoryMovement.create({
            data: { type: 'OUT', quantity: totalQty, reason: `Aggregator order ${order.orderNumber} approved`, ingredientId: r.ingredientId },
          });
        }
      }
      await writeAudit(tx, req.user.userId, AUDIT.AGGREGATOR_ORDER_APPROVED, 'Order', id, {
        orderNumber: order.orderNumber,
        externalOrderId: order.externalOrderId,
        aggregatorId: order.aggregatorId,
        itemsCount: order.items.length,
        total: order.total,
      });
      if (order.customerId) await syncCustomerTotals(tx, order.customerId);
      return o;
    });

    return res.json({ order: decorateAggregatorOrder(updated) });
  },

  /**
   * Cashier: reject a pending aggregator order.
   * Marks the order as CANCELLED (which restores no stock since none was deducted).
   */
  async reject(req: any, res: Response) {
    const id = getParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const { reason } = req.body || {};
    const order = await db.order.findUnique({ where: { id } });
    if (!order) return res.status(404).json({ error: 'الأوردر غير موجود' });
    if (order.aggregatorAction !== 'NONE' || !order.aggregatorId) {
      return res.status(400).json({ error: 'الأوردر ده مش aggregator أو اتاخد قرار عليه بالفعل' });
    }

    const updated = await db.$transaction(async (tx) => {
      const o = await tx.order.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          aggregatorAction: 'REJECTED',
          aggregatorActionById: req.user.userId,
          aggregatorActionAt: new Date(),
        },
      });
      await writeAudit(tx, req.user.userId, AUDIT.AGGREGATOR_ORDER_REJECTED, 'Order', id, {
        orderNumber: order.orderNumber,
        externalOrderId: order.externalOrderId,
        aggregatorId: order.aggregatorId,
        reason: reason || null,
      });
      return o;
    });

    return res.json({ order: decorateAggregatorOrder(updated) });
  },

  /**
   * Webhook logs (admin) — for debugging failed webhooks
   */
  async listLogs(req: any, res: Response) {
    const { aggregatorId, status, limit = '50' } = req.query as any;
    const where: any = {};
    if (aggregatorId) where.aggregatorId = String(aggregatorId);
    if (status) where.status = String(status);
    const logs = await db.aggregatorWebhookLog.findMany({
      where,
      include: { aggregator: { select: { id: true, name: true, code: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(200, parseInt(limit as string) || 50),
    });
    return res.json({ logs });
  },

  /**
   * Default field mapping — for the admin UI to show what each platform would need.
   */
  async defaultMapping(_req: Request, res: Response) {
    return res.json({ mapping: DEFAULT_FIELD_MAPPING });
  },
};

// ───────────────────────────── helpers ─────────────────────────────

const safeParseJson = (s: string): any => {
  try { return JSON.parse(s); } catch { return {}; }
};

/** Decorate order so the frontend gets parsed modifiers + aggregator info ready to render. */
function decorateAggregatorOrder(order: any) {
  return {
    ...order,
    items: (order.items || []).map((it: any) => ({
      ...it,
      modifiers: typeof it.modifiers === 'string'
        ? (() => { try { return JSON.parse(it.modifiers); } catch { return []; } })()
        : (it.modifiers || []),
    })),
  };
}

/**
 * Try to match each aggregator item to a Product. Order of attempts:
 *   1. SKU (exact match)
 *   2. Product.name (Arabic)
 *   3. Product.name (English)
 * Items that don't match go through with productId=null — the cashier can fix them in the UI.
 */
async function matchItems(items: NormalizedItem[]): Promise<(NormalizedItem & { productId: string | null })[]> {
  const skus = items.map((i) => i.sku).filter(Boolean) as string[];
  const names = items.map((i) => i.name).filter(Boolean);

  const products = await db.product.findMany({
    where: {
      isActive: true,
      OR: [
        skus.length ? { sku: { in: skus } } : undefined,
        names.length ? { OR: [{ nameAr: { in: names } }, { name: { in: names } }] } : undefined,
      ].filter(Boolean) as any,
    },
    select: { id: true, sku: true, name: true, nameAr: true, price: true },
  });

  const bySku = new Map(products.filter((p) => p.sku).map((p) => [p.sku!, p]));
  const byNameAr = new Map(products.filter((p) => p.nameAr).map((p) => [p.nameAr!, p]));
  const byName = new Map(products.filter((p) => p.name).map((p) => [p.name!, p]));

  return items.map((i) => {
    let p = i.sku ? bySku.get(i.sku) : null;
    if (!p) p = byNameAr.get(i.name);
    if (!p) p = byName.get(i.name);
    // If aggregator price is 0, fall back to our product price (still record aggregator price in notes)
    const unitPrice = i.unitPrice > 0 ? i.unitPrice : (p ? Number(p.price) : 0);
    return { ...i, productId: p?.id || null, unitPrice };
  });
}

/** Find or create customer by phone. Same logic as in customerController but isolated for the webhook flow. */
async function findOrCreateCustomerByPhone(name: string, phone: string, address: string, branchId: string): Promise<string | null> {
  if (!phone) return null;
  // Normalize phone (strip spaces, dashes)
  const normalized = phone.replace(/[\s-]/g, '');
  const existing = await db.customer.findFirst({
    where: { OR: [{ phone: normalized }, { phone }] },
  });
  if (existing) {
    // Update address if it's empty and we have a new one
    if (!existing.address && address) {
      await db.customer.update({ where: { id: existing.id }, data: { address } });
    }
    return existing.id;
  }
  const created = await db.customer.create({
    data: {
      name: name || `عميل ${normalized.slice(-4)}`,
      phone: normalized,
      address: address || null,
      branchId: branchId || null,
    },
  });
  return created.id;
}

/** Get the first admin user (for attribution on webhook-created orders) */
async function getFirstAdminId(): Promise<string | null> {
  const u = await db.user.findFirst({
    where: { role: { in: ['ADMIN', 'MANAGER'] }, isActive: true },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  return u?.id || null;
}
