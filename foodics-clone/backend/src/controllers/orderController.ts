import { Request, Response } from 'express';
import { db } from '../config/prisma';
import { getParam } from '../utils/params';
import { syncCustomerTotals, findOrCreateCustomer } from './customerController';
import { isValidPaymentMethod } from '../utils/paymentMethods';
import { writeAudit, AUDIT } from '../utils/auditLog';
import { comparePassword } from '../utils/jwt';
import { getSettingNumber, SETTING_KEYS } from './settingsController';
import { round2, computePaymentStatus } from '../utils/finance';

/** Marker class for client-input validation failures. The create-order catch
 *  block treats these as 400 (user fixable) instead of generic 500 server errors. */
class BadRequestError extends Error {
  status = 400 as const;
  constructor(message: string) { super(message); }
}

/** F-I: Tax rate per branch. We fetch the branch's configured rates
 *  (taxRateDineIn, taxRateTakeaway, taxRateDelivery) when creating an order.
 *  Falls back to the env var for backward compat. */
const TAX_RATE_FALLBACK = parseFloat(process.env.TAX_RATE_DINE_IN || '0.12');

/** Helper: load the effective tax rate for a given order type + branch.
 *  Exported so the aggregatorController can use the same logic for orders
 *  coming in via webhook. */
export const getTaxRate = async (branchId: string, type: string): Promise<number> => {
  if (!branchId) return TAX_RATE_FALLBACK;
  const branch = await db.branch.findUnique({
    where: { id: branchId },
    select: { taxRateDineIn: true, taxRateTakeaway: true, taxRateDelivery: true },
  });
  if (!branch) return TAX_RATE_FALLBACK;
  if (type === 'DINE_IN') return branch.taxRateDineIn;
  if (type === 'TAKEAWAY') return branch.taxRateTakeaway;
  if (type === 'DELIVERY') return branch.taxRateDelivery;
  return 0;
};

/**
 * Business day window: 2:00 PM (14:00) of date X → 5:00 AM (05:00) of date X+1.
 * Given a timestamp, returns the { start, end } of the business day it belongs to.
 *
 * Examples:
 *  - Aug 12 at 11:00 PM  → start = Aug 12 14:00, end = Aug 13 05:00
 *  - Aug 13 at 03:00 AM  → start = Aug 12 14:00, end = Aug 13 05:00 (same business day)
 *  - Aug 13 at 06:00 AM  → no active business day; start = Aug 13 14:00, end = Aug 14 05:00
 *  - Aug 13 at 03:00 PM  → start = Aug 13 14:00, end = Aug 14 05:00
 */
const BUSINESS_DAY_START_HOUR = 14; // 2:00 PM
const BUSINESS_DAY_END_HOUR = 5;    // 5:00 AM next day

const getBusinessDayWindow = (at: Date): { start: Date; end: Date; date: string } => {
  const d = new Date(at);
  const hour = d.getHours();

  // If we're in the "overnight" part (00:00 → 05:00), the business day started yesterday at 14:00
  if (hour < BUSINESS_DAY_END_HOUR) {
    const start = new Date(d);
    start.setDate(start.getDate() - 1);
    start.setHours(BUSINESS_DAY_START_HOUR, 0, 0, 0);
    const end = new Date(d);
    end.setHours(BUSINESS_DAY_END_HOUR, 0, 0, 0);
    return { start, end, date: start.toISOString().slice(0, 10) };
  }

  // If we're in the active part (14:00 → 23:59), the business day is today
  if (hour >= BUSINESS_DAY_START_HOUR) {
    const start = new Date(d);
    start.setHours(BUSINESS_DAY_START_HOUR, 0, 0, 0);
    const end = new Date(d);
    end.setDate(end.getDate() + 1);
    end.setHours(BUSINESS_DAY_END_HOUR, 0, 0, 0);
    return { start, end, date: start.toISOString().slice(0, 10) };
  }

  // We're in the gap (05:00 → 13:59) — no active business day, so the next one starts today at 14:00
  const start = new Date(d);
  start.setHours(BUSINESS_DAY_START_HOUR, 0, 0, 0);
  const end = new Date(d);
  end.setDate(end.getDate() + 1);
  end.setHours(BUSINESS_DAY_END_HOUR, 0, 0, 0);
  return { start, end, date: start.toISOString().slice(0, 10) };
};

/** Generate the next sequential order number for the current business day.
 *  - Sequential 1, 2, 3... resets per business day
 *  - Business day: 2:00 PM → 5:00 AM next day
 *  - Skips over any numbers already taken (handles legacy ORD-XXXX strings + race conditions)
 *  Exported so aggregatorController can use the same numbering for webhook orders. */
export const generateOrderNumber = async (maxRetries = 200): Promise<string> => {
  const now = new Date();
  const { start, end } = getBusinessDayWindow(now);
  // Count orders in this business day window as the starting point
  let nextNum = (await db.order.count({
    where: { createdAt: { gte: start, lt: end } },
  })) + 1;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const next = String(nextNum);
    // Verify free — handles both legacy string IDs and concurrent inserts
    const taken = await db.order.findFirst({ where: { orderNumber: next }, select: { id: true } });
    if (!taken) return next;
    nextNum++;
  }
  // Should never get here in practice
  return `${Date.now().toString().slice(-6)}`;
};

/** Round to 2 decimal places (cents) to avoid floating-point drift */
// round2 is imported from utils/finance (shared with the tests).

/** Safely parse the JSON-serialized modifiers field; returns [] on bad input */
const safeParse = (s: string | null | undefined): any[] => {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

/** Decorate order items so the API always returns parsed modifiers */
const decorateOrder = (order: any) => {
  if (!order) return order;
  return {
    ...order,
    items: (order.items || []).map((it: any) => ({
      ...it,
      modifiers: safeParse(it.modifiers),
    })),
  };
};

export const orderController = {
  async list(req: any, res: Response) {
    const { status, type, branchId, startDate, endDate, limit = '50' } = req.query;
    const where: any = {};
    if (status) {
      const statuses = String(status).split(',').map((s) => s.trim()).filter(Boolean);
      where.status = statuses.length > 1 ? { in: statuses } : statuses[0];
    }
    if (type) where.type = type;
    if (branchId) where.branchId = branchId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) where.createdAt.lte = new Date(endDate as string);
    }
    const orders = await db.order.findMany({
      where,
      include: {
        items: { include: { product: true } },
        user: { select: { id: true, name: true } },
        table: true,
        branch: true,
        deliveryOptions: { include: { deliveryOption: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string),
    });
    return res.json({ orders: orders.map(decorateOrder) });
  },

  async get(req: Request, res: Response) {
    const order = await db.order.findUnique({
      where: { id: getParam(req.params.id) },
      include: {
        items: { include: { product: true } },
        user: { select: { id: true, name: true, email: true } },
        table: true,
        branch: true,
        deliveryOptions: { include: { deliveryOption: true } },
      },
    });
    if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
    return res.json({ order: decorateOrder(order) });
  },

  async create(req: any, res: Response) {
    try {
      const { type = 'DINE_IN', customerName, customerPhone, customerAddress, notes, items, tableId, branchId, discount = 0, deliveryOptionIds = [], customDeliveryFees, hold = false } = req.body;
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'لا بد من إضافة منتجات للأوردر' });
      }
      // HELD orders are "saved for later" — skip table/customer checks so a quick pause-and-resume works
      if (!hold && type === 'DELIVERY' && (!customerName || !customerPhone || !customerAddress)) {
        return res.status(400).json({ error: 'برجاء إدخال اسم العميل ورقم الهاتف والعنوان للتوصيل' });
      }

      // Resolve products and variants in bulk
      const productIds = items.filter((i: any) => i.productId).map((i: any) => i.productId);
      const variantIds = items.filter((i: any) => i.variantId).map((i: any) => i.variantId);

      const [products, variants, recipes, allGroups] = await Promise.all([
        productIds.length ? db.product.findMany({ where: { id: { in: productIds } } }) : Promise.resolve([]),
        variantIds.length ? db.productVariant.findMany({ where: { id: { in: variantIds } } }) : Promise.resolve([]),
        productIds.length ? db.recipe.findMany({ where: { productId: { in: productIds } } }) : Promise.resolve([]),
        productIds.length ? db.productModifierGroup.findMany({
          where: { productId: { in: productIds }, isActive: true },
          include: { options: { where: { isActive: true } } },
        }) : Promise.resolve([]),
      ]);
      const productMap = new Map(products.map((p) => [p.id, p]));
      const variantMap = new Map(variants.map((v) => [v.id, v]));
      const recipesByProduct = new Map<string, typeof recipes>();
      for (const r of recipes) {
        const arr = recipesByProduct.get(r.productId) || [];
        arr.push(r);
        recipesByProduct.set(r.productId, arr);
      }
      const groupsByProduct = new Map<string, typeof allGroups>();
      for (const g of allGroups) {
        const arr = groupsByProduct.get(g.productId) || [];
        arr.push(g);
        groupsByProduct.set(g.productId, arr);
      }

      let subtotal = 0;
      const orderItemsData: any[] = [];
      for (const item of items) {
        const qty = Math.max(1, Math.floor(Number(item.quantity) || 0));
        if (qty <= 0) throw new Error('الكمية يجب أن تكون أكبر من صفر');

        // Product line (with optional variant + modifiers)
        const product = productMap.get(item.productId);
        if (!product) throw new Error(`المنتج ${item.productId} غير موجود`);

        let unitPrice = Number(product.price);
        let variantLabel: string | null = null;
        const selectedModifiers: any[] = [];

        if (item.variantId) {
          const v = variantMap.get(item.variantId);
          if (!v || v.productId !== product.id) throw new Error('الفاريانت غير صالح لهذا الصنف');
          unitPrice = Number(v.price);
          variantLabel = v.labelAr || v.label;
        }

        // B-3: run modifier validation even if the client omitted `modifiers` entirely,
        // so a required group can never be silently bypassed by just not sending the field.
        const itemModifiers = Array.isArray(item.modifiers) ? item.modifiers : [];
        if (itemModifiers.length > 0 || (groupsByProduct.get(product.id) || []).some((g: any) => g.required)) {
          // Validate + sum price deltas server-side (never trust client price)
          const optIds = itemModifiers.map((m: any) => m.optionId);
          const opts = await db.modifierOption.findMany({ where: { id: { in: optIds } } });
          const optMap = new Map(opts.map((o) => [o.id, o]));
          // B-3: enforce ModifierGroup rules (required / minSelect / maxSelect / SINGLE)
          // BEFORE we trust the client-supplied modifier list, so a kitchen-critical
          // group like "choose your bread" can't be silently skipped or over-ordered.
          // We run this even for an empty modifiers array, so a missing required
          // group is caught (the client can't just omit the field to bypass it).
          const productGroups = groupsByProduct.get(product.id) || [];
          const groupById = new Map(productGroups.map((g) => [g.id, g]));
          const selectedByGroup = new Map<string, number>();
          for (const m of itemModifiers) {
            const o = optMap.get(m.optionId);
            if (!o) continue;
            const g = groupById.get(o.groupId);
            if (!g) continue; // already filtered by groupId match below
            selectedByGroup.set(g.id, (selectedByGroup.get(g.id) || 0) + 1);
          }
          for (const g of productGroups) {
            const selected = selectedByGroup.get(g.id) || 0;
            const min = Number(g.minSelect || 0);
            const max = Number(g.maxSelect || 0);
            const name = g.nameAr || g.name;
            if (g.required && selected < 1) {
              throw new BadRequestError(`يجب اختيار ${name}`);
            }
            if (g.type === 'SINGLE' && selected > 1) {
              throw new BadRequestError(`يمكن اختيار خيار واحد فقط من ${name}`);
            }
            if (min > 0 && selected < min) {
              throw new BadRequestError(`يجب اختيار ${min} على الأقل من ${name}`);
            }
            if (max > 0 && selected > max) {
              throw new BadRequestError(`يمكن اختيار ${max} على الأكثر من ${name}`);
            }
          }
          for (const m of itemModifiers) {
            const o = optMap.get(m.optionId);
            if (!o) continue;
            const g = groupById.get(o.groupId);
            if (!g) continue; // skip cross-product modifiers
            unitPrice += Number(o.priceDelta || 0);
            selectedModifiers.push({
              groupId: o.groupId,
              groupName: g.nameAr || g.name,
              optionId: o.id,
              optionLabel: o.labelAr || o.label,
              priceDelta: Number(o.priceDelta || 0),
            });
          }
        }

        unitPrice = round2(Math.max(0, unitPrice));
        const lineTotal = round2(unitPrice * qty);
        subtotal += lineTotal;
        orderItemsData.push({
          productId: product.id,
          variantId: item.variantId || null,
          variantLabel,
          modifiers: selectedModifiers.length ? JSON.stringify(selectedModifiers) : null,
          quantity: qty,
          price: unitPrice,
          notes: item.notes || null,
        });
      }

      // Delivery options (F-H custom fee)
      let deliveryFee = 0;
      const deliveryOptionsData: any[] = [];
      if (Array.isArray(deliveryOptionIds) && deliveryOptionIds.length > 0) {
        const opts = await db.deliveryOption.findMany({ where: { id: { in: deliveryOptionIds } } });
        const customMap = new Map<string, number>();
        if (Array.isArray(customDeliveryFees)) {
          for (const cf of customDeliveryFees) {
            if (cf && cf.optionId != null && cf.fee != null) {
              customMap.set(String(cf.optionId), Number(cf.fee));
            }
          }
        }
        for (const opt of opts) {
          let fee = Number(opt.fee) || 0;
          if (opt.allowCustomFee && customMap.has(opt.id)) {
            const provided = customMap.get(opt.id)!;
            let clamped = provided;
            if (opt.minFee != null) clamped = Math.max(clamped, Number(opt.minFee));
            if (opt.maxFee != null) clamped = Math.min(clamped, Number(opt.maxFee));
            clamped = Math.max(0, clamped);
            fee = clamped;
          }
          fee = round2(fee);
          deliveryFee += fee;
          deliveryOptionsData.push({ deliveryOptionId: opt.id, fee });
        }
      }

      const discountNum = Math.max(0, parseFloat(discount) || 0);
      if (discountNum > subtotal) {
        return res.status(400).json({ error: 'الخصم أكبر من الإجمالي' });
      }
      const DISCOUNT_CASHIER_LIMIT_PCT = await getSettingNumber(SETTING_KEYS.DISCOUNT_CASHIER_LIMIT_PCT, 0.20);
      if (subtotal > 0 && (req as any).user?.role === 'CASHIER' &&
          (discountNum / subtotal) > DISCOUNT_CASHIER_LIMIT_PCT) {
        const { managerPin } = req.body;
        if (!managerPin) {
          return res.status(403).json({
            error: `الخصم أكبر من الحد المسموح (${DISCOUNT_CASHIER_LIMIT_PCT * 100}%). يحتاج موافقة مدير.`,
            requiresManager: true,
            limitPct: DISCOUNT_CASHIER_LIMIT_PCT * 100,
          });
        }
        const managers = await db.user.findMany({
          where: { role: { in: ['ADMIN', 'MANAGER'] }, isActive: true },
          select: { id: true, password: true },
        });
        let matchedId: string | null = null;
        for (const m of managers) {
          if (await comparePassword(String(managerPin), m.password)) {
            matchedId = m.id;
            break;
          }
        }
        if (!matchedId) return res.status(403).json({ error: 'رمز المدير غير صحيح' });
        (req as any).managerApprovedBy = matchedId;
      }
      const afterDiscount = round2(subtotal - discountNum);
      const taxRate = await getTaxRate(branchId, type);
      const tax = round2(afterDiscount * taxRate);
      const total = round2(afterDiscount + tax + deliveryFee);

      // B-2: Pre-flight stock check (only for non-HELD orders; HELD deducts on resume).
      // Without this the user gets a cryptic Prisma error when stock goes negative.
      if (!hold) {
        // Aggregate required quantities per product + per ingredient (via recipes)
        const requiredByProduct = new Map<string, number>();
        for (const it of orderItemsData) {
          if (!it.productId) continue;
          requiredByProduct.set(it.productId, (requiredByProduct.get(it.productId) || 0) + Number(it.quantity || 0));
        }
        const requiredByIngredient = new Map<string, number>();
        for (const [productId, qty] of requiredByProduct) {
          const recs = recipesByProduct.get(productId) || [];
          for (const r of recs) {
            requiredByIngredient.set(r.ingredientId, (requiredByIngredient.get(r.ingredientId) || 0) + Number(r.quantity) * qty);
          }
        }
        // Fetch current stock for everything we need
        const productInvIds = Array.from(requiredByProduct.keys());
        const ingredientIds = Array.from(requiredByIngredient.keys());
        const [productInv, ingredientStock] = await Promise.all([
          productInvIds.length ? db.inventory.findMany({ where: { productId: { in: productInvIds } } }) : Promise.resolve([]),
          ingredientIds.length ? db.ingredient.findMany({ where: { id: { in: ingredientIds } } }) : Promise.resolve([]),
        ]);
        const productInvMap = new Map(productInv.map((i) => [i.productId, i]));
        const ingredientMap = new Map(ingredientStock.map((i) => [i.id, i]));
        // Build shortage list
        const shortages: { name: string; need: number; have: number; unit?: string }[] = [];
        for (const [productId, need] of requiredByProduct) {
          const inv = productInvMap.get(productId);
          // No inventory row = untracked product; only fail if we have a recipe
          // (recipe implies ingredients ARE tracked, but a product with no inventory + no recipe
          // is treated as a non-stock item like a service or a manual entry).
          if (!inv) {
            const hasRecipe = (recipesByProduct.get(productId) || []).length > 0;
            if (hasRecipe) {
              const p = productMap.get(productId);
              shortages.push({ name: p?.nameAr || p?.name || productId, need, have: 0, unit: 'pcs' });
            }
            continue;
          }
          if (Number(inv.stock) < need) {
            const p = productMap.get(productId);
            shortages.push({ name: p?.nameAr || p?.name || productId, need, have: Number(inv.stock), unit: inv.unit });
          }
        }
        for (const [ingId, need] of requiredByIngredient) {
          const ing = ingredientMap.get(ingId);
          if (!ing) continue;
          if (Number(ing.stock) < need) {
            shortages.push({ name: ing.name, need, have: Number(ing.stock), unit: ing.unit });
          }
        }
        if (shortages.length > 0) {
          const detail = shortages
            .map((s) => `${s.name} (متاح ${s.have} ${s.unit || ''}، مطلوب ${s.need})`)
            .join('، ');
          return res.status(400).json({ error: `نفذ المخزون: ${detail}`, shortages });
        }
      }

      const orderNumber = await generateOrderNumber();

      // P1.3: For DELIVERY orders with a phone, link to a Customer record (find or create)
      // so we can track debt and order history for this person.
      let customerId: string | null = null;
      if (type === 'DELIVERY' && customerPhone) {
        customerId = await findOrCreateCustomer(
          db,
          customerName,
          customerPhone,
          customerAddress,
          branchId || req.user.branchId,
        );
      }

      const order = await db.order.create({
        data: {
          orderNumber,
          type,
          // HELD = suspended/saved-for-later, does not go to kitchen, no inventory deduction
          status: hold ? 'HELD' : 'PENDING',
          customerName,
          customerPhone,
          customerAddress,
          customerId,
          notes,
          subtotal: round2(subtotal),
          discount: round2(discountNum),
          tax,
          deliveryFee,
          total,
          branchId: branchId || req.user.branchId || (await db.branch.findFirst())?.id,
          tableId: tableId || null,
          userId: req.user.userId,
          items: { create: orderItemsData },
          deliveryOptions: { create: deliveryOptionsData },
        },
        include: {
          items: { include: { product: true } },
          user: { select: { id: true, name: true } },
          table: true,
          deliveryOptions: { include: { deliveryOption: true } },
        },
      });

      // P1.3: sync customer totals after order creation
      if (customerId) await syncCustomerTotals(db, customerId);

      // Update table status if dine-in
      if (!hold && tableId && type === 'DINE_IN') {
        await db.table.update({ where: { id: tableId }, data: { status: 'OCCUPIED' } });
      }

      // Deduct product inventory (HELD orders keep stock untouched until resumed)
      if (!hold) for (const item of orderItemsData) {
        if (!item.productId) continue;
        const inv = await db.inventory.findUnique({ where: { productId: item.productId } });
        if (inv) {
          await db.inventory.update({
            where: { productId: item.productId },
            data: { stock: { decrement: item.quantity } },
          });
          await db.inventoryMovement.create({
            data: {
              type: 'OUT',
              quantity: item.quantity,
              reason: `Order ${orderNumber}`,
              productId: item.productId,
            },
          });
        }
        // Deduct ingredients per recipe
        const recipes = await db.recipe.findMany({ where: { productId: item.productId } });
        for (const r of recipes) {
          const totalQty = r.quantity * item.quantity;
          await db.ingredient.update({
            where: { id: r.ingredientId },
            data: { stock: { decrement: totalQty } },
          });
          await db.inventoryMovement.create({
            data: {
              type: 'OUT',
              quantity: totalQty,
              reason: `Order ${orderNumber}`,
              ingredientId: r.ingredientId,
            },
          });
        }
      }

      // Parse modifiers JSON for response
      const orderResponse = {
        ...order,
        items: order.items.map((it: any) => ({
          ...it,
          modifiers: it.modifiers ? safeParse(it.modifiers) : null,
        })),
      };
      return res.status(201).json({ order: orderResponse });
    } catch (err: any) {
      if (err instanceof BadRequestError) {
        return res.status(400).json({ error: err.message });
      }
      return res.status(500).json({ error: err.message });
    }
  },

  /**
   * Resume a HELD order — convert HELD → PENDING and deduct inventory (now).
   * Used after a cashier "loads back" a suspended order into the active cart and
   * either sends it to the kitchen or pays for it.
   */
  async resume(req: any, res: Response) {
    try {
      const id = getParam(req.params.id);
      const existing = await db.order.findUnique({
        where: { id },
        include: { items: { include: { product: true } }, payments: true, table: true },
      });
      if (!existing) return res.status(404).json({ error: 'الأوردر غير موجود' });
      if (existing.status !== 'HELD') {
        return res.status(400).json({ error: `لا يمكن استئناف أوردر بحالة ${existing.status}` });
      }
      if (existing.paymentStatus === 'PAID') {
        return res.status(400).json({ error: 'الأوردر مدفوع بالفعل' });
      }

      // B-2: Pre-flight stock check before resuming a HELD order.
      // (Was skipped at create-time because HELD doesn't deduct; this is when it actually commits.)
      {
        const requiredByProduct = new Map<string, number>();
        for (const it of existing.items) {
          if (!it.productId) continue;
          requiredByProduct.set(it.productId, (requiredByProduct.get(it.productId) || 0) + Number(it.quantity || 0));
        }
        const productIds = Array.from(requiredByProduct.keys());
        const recipes = productIds.length ? await db.recipe.findMany({ where: { productId: { in: productIds } } }) : [];
        const requiredByIngredient = new Map<string, number>();
        for (const r of recipes) {
          const qty = requiredByProduct.get(r.productId) || 0;
          requiredByIngredient.set(r.ingredientId, (requiredByIngredient.get(r.ingredientId) || 0) + Number(r.quantity) * qty);
        }
        const [productInv, ingredientStock] = await Promise.all([
          productIds.length ? db.inventory.findMany({ where: { productId: { in: productIds } } }) : Promise.resolve([]),
          requiredByIngredient.size ? db.ingredient.findMany({ where: { id: { in: Array.from(requiredByIngredient.keys()) } } }) : Promise.resolve([]),
        ]);
        const productInvMap = new Map(productInv.map((i) => [i.productId, i]));
        const ingredientMap = new Map(ingredientStock.map((i) => [i.id, i]));
        const shortages: { name: string; need: number; have: number; unit?: string }[] = [];
        for (const [productId, need] of requiredByProduct) {
          const inv = productInvMap.get(productId);
          if (!inv) continue; // untracked product — let the decrement silently no-op
          if (Number(inv.stock) < need) {
            const p = existing.items.find((it) => it.productId === productId)?.product;
            shortages.push({ name: p?.nameAr || p?.name || productId, need, have: Number(inv.stock), unit: inv.unit });
          }
        }
        for (const [ingId, need] of requiredByIngredient) {
          const ing = ingredientMap.get(ingId);
          if (!ing) continue;
          if (Number(ing.stock) < need) {
            shortages.push({ name: ing.name, need, have: Number(ing.stock), unit: ing.unit });
          }
        }
        if (shortages.length > 0) {
          const detail = shortages.map((s) => `${s.name} (متاح ${s.have} ${s.unit || ''}، مطلوب ${s.need})`).join('، ');
          return res.status(400).json({ error: `نفذ المخزون: ${detail}`, shortages });
        }
      }

      // Deduct inventory now (was skipped when HELD)
      for (const item of existing.items) {
        if (!item.productId) continue;
        const inv = await db.inventory.findUnique({ where: { productId: item.productId } });
        if (inv) {
          await db.inventory.update({
            where: { productId: item.productId },
            data: { stock: { decrement: item.quantity } },
          });
          await db.inventoryMovement.create({
            data: {
              type: 'OUT',
              quantity: item.quantity,
              reason: `Resume ${existing.orderNumber}`,
              productId: item.productId,
            },
          });
        }
        const recipes = await db.recipe.findMany({ where: { productId: item.productId } });
        for (const r of recipes) {
          const totalQty = r.quantity * item.quantity;
          await db.ingredient.update({
            where: { id: r.ingredientId },
            data: { stock: { decrement: totalQty } },
          });
          await db.inventoryMovement.create({
            data: { type: 'OUT', quantity: totalQty, reason: `Resume ${existing.orderNumber}`, ingredientId: r.ingredientId },
          });
        }
      }

      // Promote to PENDING and grab the table if dine-in
      const updated = await db.order.update({
        where: { id },
        data: { status: 'PENDING' },
        include: { items: { include: { product: true } }, payments: true, user: { select: { id: true, name: true } }, table: true },
      });
      if (updated.tableId && updated.type === 'DINE_IN') {
        await db.table.update({ where: { id: updated.tableId }, data: { status: 'OCCUPIED' } });
      }
      return res.json({ order: decorateOrder(updated) });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },

  /**
   * Discard a HELD order (delete it outright — it was never charged and never
   * hit the kitchen, so no inventory restoration is needed).
   */
  async discardHold(req: any, res: Response) {
    try {
      const id = getParam(req.params.id);
      const existing = await db.order.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'الأوردر غير موجود' });
      if (existing.status !== 'HELD') {
        return res.status(400).json({ error: `لا يمكن حذف أوردر معلق إلا لو حالته HELD` });
      }
      if (existing.paymentStatus === 'PAID') {
        return res.status(400).json({ error: 'الأوردر مدفوع — استخدم الإلغاء' });
      }
      await db.order.delete({ where: { id } });
      return res.json({ message: 'تم حذف الأوردر المعلق' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },

  async update(req: any, res: Response) {
    try {
      const { type, customerName, customerPhone, customerAddress, notes, items, tableId, discount, deliveryOptionIds, customDeliveryFees, managerPin } = req.body;
      const existing = await db.order.findUnique({
        where: { id: getParam(req.params.id) },
        include: { items: { include: { product: true } }, deliveryOptions: true, payments: true },
      });
      if (!existing) return res.status(404).json({ error: 'الأوردر غير موجود' });
      if (existing.status === 'CANCELLED') {
        return res.status(400).json({ error: 'لا يمكن تعديل أوردر ملغي' });
      }
      // F-A: Edit paid order is allowed ONLY with manager PIN (used for price corrections
      // after payment, e.g. cashier mis-typed the price). The order's payment state is preserved
      // — we adjust totals but don't touch the existing Payment rows. The customer is told to
      // pay the difference (if new total > already paid) or receive the overpayment as credit.
      if (existing.paymentStatus === 'PAID' || existing.paymentStatus === 'PARTIAL') {
        if (!managerPin) {
          return res.status(403).json({
            error: 'تعديل أوردر مدفوع يحتاج موافقة مدير',
            requiresManager: true,
          });
        }
        const managers = await db.user.findMany({
          where: { role: { in: ['ADMIN', 'MANAGER'] }, isActive: true },
          select: { id: true, password: true, name: true },
        });
        let matched: { id: string; name: string } | null = null;
        for (const m of managers) {
          if (await comparePassword(String(managerPin), m.password)) {
            matched = { id: m.id, name: m.name };
            break;
          }
        }
        if (!matched) return res.status(403).json({ error: 'رمز المدير غير صحيح' });
        (req as any).managerApprovedBy = matched.id;
        (req as any).managerApprovedByName = matched.name;
      }
      // HELD orders: stock was never deducted, so we skip the restore loop.
      // We also skip the deduct loop below since the order stays HELD — inventory
      // is touched exactly once, when the order is resumed.
      const isHeld = existing.status === 'HELD';

      // Restore old product inventory & ingredients (skip if HELD — nothing was deducted)
      if (!isHeld) for (const old of existing.items) {
        const inv = await db.inventory.findUnique({ where: { productId: old.productId } });
        if (inv) {
          await db.inventory.update({
            where: { productId: old.productId },
            data: { stock: { increment: old.quantity } },
          });
          await db.inventoryMovement.create({
            data: { type: 'IN', quantity: old.quantity, reason: `Restore from edit ${existing.orderNumber}`, productId: old.productId },
          });
        }
        const recipes = await db.recipe.findMany({ where: { productId: old.productId } });
        for (const r of recipes) {
          const totalQty = r.quantity * old.quantity;
          await db.ingredient.update({
            where: { id: r.ingredientId },
            data: { stock: { increment: totalQty } },
          });
          await db.inventoryMovement.create({
            data: { type: 'IN', quantity: totalQty, reason: `Restore from edit ${existing.orderNumber}`, ingredientId: r.ingredientId },
          });
        }
      }

      // Validate new items
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'لا بد من إضافة منتجات للأوردر' });
      }
      const newType = type || existing.type;
      // For HELD orders we relax the customer-required check too — cashier may be
      // editing the order in pieces and will fill customer data later (or on resume).
      if (!isHeld && newType === 'DELIVERY' && (!customerName || !customerPhone || !customerAddress)) {
        return res.status(400).json({ error: 'برجاء إدخال بيانات العميل للتوصيل' });
      }

      // Resolve products + variants in bulk (same as create)
      const productIds = items.filter((i: any) => i.productId).map((i: any) => i.productId);
      const variantIds = items.filter((i: any) => i.variantId).map((i: any) => i.variantId);
      const [products, variants] = await Promise.all([
        productIds.length ? db.product.findMany({ where: { id: { in: productIds } } }) : Promise.resolve([]),
        variantIds.length ? db.productVariant.findMany({ where: { id: { in: variantIds } } }) : Promise.resolve([]),
      ]);
      const productMap = new Map(products.map((p) => [p.id, p]));
      const variantMap = new Map(variants.map((v) => [v.id, v]));

      let subtotal = 0;
      const newItemsData: any[] = [];
      // F-A: When the existing order is PAID, allow an explicit price override per item.
      // This is the "price correction" path — the cashier types a new price (e.g. customer
      // was overcharged) and we trust the override because the manager has already
      // approved via managerPin at the route level.
      const isPaidEdit = existing.paymentStatus === 'PAID' || existing.paymentStatus === 'PARTIAL';
      for (const item of items) {
        const qty = Math.max(1, Math.floor(Number(item.quantity) || 0));
        if (qty <= 0) throw new Error('الكمية يجب أن تكون أكبر من صفر');
        const product = productMap.get(item.productId);
        if (!product) throw new Error(`المنتج ${item.productId} غير موجود`);

        let unitPrice = Number(product.price);
        let variantLabel: string | null = null;
        const selectedModifiers: any[] = [];

        if (item.variantId) {
          const v = variantMap.get(item.variantId);
          if (!v || v.productId !== product.id) throw new Error('الفاريانت غير صالح لهذا الصنف');
          unitPrice = Number(v.price);
          variantLabel = v.labelAr || v.label;
        }

        if (Array.isArray(item.modifiers) && item.modifiers.length > 0) {
          const optIds = item.modifiers.map((m: any) => m.optionId);
          const opts = await db.modifierOption.findMany({ where: { id: { in: optIds } } });
          const optMap = new Map(opts.map((o) => [o.id, o]));
          for (const m of item.modifiers) {
            const o = optMap.get(m.optionId);
            if (!o) continue;
            const g = await db.productModifierGroup.findUnique({ where: { id: o.groupId } });
            if (!g || g.productId !== product.id) continue;
            unitPrice += Number(o.priceDelta || 0);
            selectedModifiers.push({
              groupId: o.groupId,
              groupName: g.nameAr || g.name,
              optionId: o.id,
              optionLabel: o.labelAr || o.label,
              priceDelta: Number(o.priceDelta || 0),
            });
          }
        }

        // F-A: explicit price override (price correction). Only honored on paid-order edits.
        if (isPaidEdit && item.priceOverride != null) {
          const override = Number(item.priceOverride);
          if (isFinite(override) && override >= 0) {
            unitPrice = override;
          }
        }

        unitPrice = round2(Math.max(0, unitPrice));
        const lineTotal = round2(unitPrice * qty);
        subtotal += lineTotal;
        newItemsData.push({
          productId: product.id,
          variantId: item.variantId || null,
          variantLabel,
          modifiers: selectedModifiers.length ? JSON.stringify(selectedModifiers) : null,
          quantity: qty,
          price: unitPrice,
          notes: item.notes || null,
        });
      }

      // Delivery options (F-H custom fee)
      let deliveryFee = 0;
      const deliveryOptionsData: any[] = [];
      if (Array.isArray(deliveryOptionIds) && deliveryOptionIds.length > 0) {
        const opts = await db.deliveryOption.findMany({ where: { id: { in: deliveryOptionIds } } });
        const customMap = new Map<string, number>();
        if (Array.isArray(customDeliveryFees)) {
          for (const cf of customDeliveryFees) {
            if (cf && cf.optionId != null && cf.fee != null) {
              customMap.set(String(cf.optionId), Number(cf.fee));
            }
          }
        }
        for (const opt of opts) {
          let fee = Number(opt.fee) || 0;
          if (opt.allowCustomFee && customMap.has(opt.id)) {
            const provided = customMap.get(opt.id)!;
            let clamped = provided;
            if (opt.minFee != null) clamped = Math.max(clamped, Number(opt.minFee));
            if (opt.maxFee != null) clamped = Math.min(clamped, Number(opt.maxFee));
            clamped = Math.max(0, clamped);
            fee = clamped;
          }
          fee = round2(fee);
          deliveryFee += fee;
          deliveryOptionsData.push({ deliveryOptionId: opt.id, fee });
        }
      }

      const discountNum = Math.max(0, parseFloat(discount ?? existing.discount) || 0);
      if (discountNum > subtotal) {
        return res.status(400).json({ error: 'الخصم أكبر من الإجمالي' });
      }
      // P1.3: same discount threshold check on HELD-order edits (F-H: configurable)
      const DISCOUNT_CASHIER_LIMIT_PCT = await getSettingNumber(SETTING_KEYS.DISCOUNT_CASHIER_LIMIT_PCT, 0.20);
      if (subtotal > 0 && (req as any).user?.role === 'CASHIER' &&
          (discountNum / subtotal) > DISCOUNT_CASHIER_LIMIT_PCT) {
        const { managerPin } = req.body;
        if (!managerPin) {
          return res.status(403).json({
            error: `الخصم أكبر من الحد المسموح (${DISCOUNT_CASHIER_LIMIT_PCT * 100}%). يحتاج موافقة مدير.`,
            requiresManager: true,
            limitPct: DISCOUNT_CASHIER_LIMIT_PCT * 100,
          });
        }
        const managers = await db.user.findMany({
          where: { role: { in: ['ADMIN', 'MANAGER'] }, isActive: true },
          select: { id: true, password: true },
        });
        let matchedId: string | null = null;
        for (const m of managers) {
          if (await comparePassword(String(managerPin), m.password)) {
            matchedId = m.id;
            break;
          }
        }
        if (!matchedId) return res.status(403).json({ error: 'رمز المدير غير صحيح' });
        (req as any).managerApprovedBy = matchedId;
      }
      const afterDiscount = round2(subtotal - discountNum);
      // F-I: tax rate is per-branch now. We need to fetch the branch to get it.
      const taxRate = await getTaxRate(existing.branchId, newType);
      const tax = round2(afterDiscount * taxRate);
      const total = round2(afterDiscount + tax + deliveryFee);

      // Delete old items & delivery options
      await db.orderItem.deleteMany({ where: { orderId: existing.id } });
      await db.orderDeliveryOption.deleteMany({ where: { orderId: existing.id } });

      // Update order
      const order = await db.order.update({
        where: { id: existing.id },
        data: {
          type: newType,
          customerName: customerName ?? existing.customerName,
          customerPhone: customerPhone ?? existing.customerPhone,
          customerAddress: customerAddress ?? existing.customerAddress,
          notes: notes ?? existing.notes,
          tableId: tableId ?? existing.tableId,
          subtotal: round2(subtotal),
          discount: round2(discountNum),
          tax,
          deliveryFee,
          total,
          items: { create: newItemsData },
          deliveryOptions: { create: deliveryOptionsData },
        },
        include: { items: { include: { product: true } }, user: { select: { id: true, name: true } }, table: true, deliveryOptions: { include: { deliveryOption: true } } },
      });

      // Deduct new product inventory & ingredients (HELD orders keep stock untouched until resume)
      if (!isHeld) for (const item of newItemsData) {
        const inv = await db.inventory.findUnique({ where: { productId: item.productId } });
        if (inv) {
          await db.inventory.update({ where: { productId: item.productId }, data: { stock: { decrement: item.quantity } } });
          await db.inventoryMovement.create({ data: { type: 'OUT', quantity: item.quantity, reason: `Edit order ${existing.orderNumber}`, productId: item.productId } });
        }
        const recipes = await db.recipe.findMany({ where: { productId: item.productId } });
        for (const r of recipes) {
          const totalQty = r.quantity * item.quantity;
          await db.ingredient.update({ where: { id: r.ingredientId }, data: { stock: { decrement: totalQty } } });
          await db.inventoryMovement.create({ data: { type: 'OUT', quantity: totalQty, reason: `Edit order ${existing.orderNumber}`, ingredientId: r.ingredientId } });
        }
      }

      // P0.2: audit log for the edit. We log the diff (old vs new totals + item count) so
      // the audit page can show what changed without fetching the whole order.
      const auditMeta: any = {
        orderNumber: existing.orderNumber,
        previousTotal: existing.total,
        newTotal: total,
        previousItemsCount: existing.items.length,
        newItemsCount: newItemsData.length,
        wasHeld: isHeld,
        previousPaymentStatus: existing.paymentStatus,
      };
      // F-A: mark when the edit required manager approval (paid order)
      if (existing.paymentStatus === 'PAID' || existing.paymentStatus === 'PARTIAL') {
        auditMeta.editedPaidOrder = true;
        auditMeta.managerApprovedBy = (req as any).managerApprovedBy;
        auditMeta.managerApprovedByName = (req as any).managerApprovedByName;
      }
      await writeAudit(db, req.user.userId, AUDIT.ORDER_EDIT, 'Order', existing.id, auditMeta);

      return res.json({ order: decorateOrder(order), isPaidOrderEdit: existing.paymentStatus !== 'UNPAID' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },

  async cancel(req: any, res: Response) {
    const orderId = getParam(req.params.id);
    if (!orderId) return res.status(400).json({ error: 'Invalid order id' });
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: { items: true, deliveryOptions: true, payments: true },
    });
    if (!order) return res.status(404).json({ error: 'الأوردر غير موجود' });
    if (order.status === 'CANCELLED') return res.json({ order, message: 'الأوردر ملغي بالفعل' });

    // Wrap whole cancel flow in a single transaction so:
    //  - inventory restore + order status change are atomic
    //  - if anything throws we don't half-restore stock
    //  - audit log is committed with the cancel (P0.2)
    const updated = await db.$transaction(async (tx) => {
      // Restore inventory
      for (const item of order.items) {
        const inv = await tx.inventory.findUnique({ where: { productId: item.productId } });
        if (inv) {
          await tx.inventory.update({ where: { productId: item.productId }, data: { stock: { increment: item.quantity } } });
          await tx.inventoryMovement.create({ data: { type: 'IN', quantity: item.quantity, reason: `Cancel ${order.orderNumber}`, productId: item.productId } });
        }
        const recipes = await tx.recipe.findMany({ where: { productId: item.productId } });
        for (const r of recipes) {
          const totalQty = r.quantity * item.quantity;
          await tx.ingredient.update({ where: { id: r.ingredientId }, data: { stock: { increment: totalQty } } });
          await tx.inventoryMovement.create({ data: { type: 'IN', quantity: totalQty, reason: `Cancel ${order.orderNumber}`, ingredientId: r.ingredientId } });
        }
      }

      // Free table
      if (order.tableId) {
        await tx.table.update({ where: { id: order.tableId }, data: { status: 'AVAILABLE' } });
      }

      // If the order was already paid, mark every Payment as refunded (cancelled).
      // The actual money transfer (to the customer) is recorded in the Refund table —
      // for now, we mark them with refundedAt + reason so reports can show what was
      // collected but never netted into revenue.
      const paidPayments = order.payments.filter((p) => !p.refundedAt);
      if (paidPayments.length > 0) {
        await tx.payment.updateMany({
          where: { id: { in: paidPayments.map((p) => p.id) } },
          data: { refundedAt: new Date(), refundReason: `Order ${order.orderNumber} cancelled` },
        });
      }

      const upd = await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'CANCELLED',
          // FIX (P0.2): Clear payment state on cancel — if any money was paid it should be
          // considered owed to the customer (handled by the future Refund flow, P1.2).
          // For now we mark as UNPAID and zero out paidAmount so the order doesn't show as
          // PARTIAL any more.
          paidAmount: 0,
          paymentStatus: 'UNPAID',
        },
        include: { items: { include: { product: true } }, user: true, table: true, customer: { select: { id: true } } },
      });
      // P1.3: re-sync customer outstanding after cancel
      if (upd.customer?.id) await syncCustomerTotals(tx, upd.customer.id);
      // P0.2: audit log
      await writeAudit(tx, req.user.userId, AUDIT.ORDER_CANCEL, 'Order', order.id, {
        orderNumber: order.orderNumber,
        previousStatus: order.status,
        previousPaymentStatus: order.paymentStatus,
        total: order.total,
        itemsCount: order.items.length,
        hadPaidPayments: paidPayments.length,
      });
      return upd;
    });
    return res.json({ order: updated, message: 'تم إلغاء الأوردر' });
  },

  async updateStatus(req: Request, res: Response) {
    const { status } = req.body;
    const validStatuses = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'حالة غير صالحة' });
    }
    // If transitioning to CANCELLED, use cancel() for inventory restoration
    if (status === 'CANCELLED') {
      return this.cancel(req, res);
    }
    const order = await db.order.update({
      where: { id: getParam(req.params.id) },
      data: {
        status,
        ...(status === 'COMPLETED' && { completedAt: new Date() }),
      },
      include: { items: { include: { product: true } } },
    });

    if (status === 'COMPLETED' || status === 'CANCELLED') {
      if (order.tableId) {
        await db.table.update({ where: { id: order.tableId }, data: { status: 'AVAILABLE' } });
      }
    }
    return res.json({ order });
  },

  async pay(req: Request, res: Response) {
    const { paymentMethod, amount, tip = 0, reference, payerName, notes } = req.body;
    if (!isValidPaymentMethod(paymentMethod)) {
      return res.status(400).json({ error: 'طريقة دفع غير صالحة. المسموح: CASH, CARD, INSTAPAY' });
    }
    const orderId = getParam(req.params.id);
    const order = await db.order.findUnique({ where: { id: orderId }, include: { payments: true } });
    if (!order) return res.status(404).json({ error: 'الأوردر غير موجود' });
    if (order.status === 'CANCELLED') return res.status(400).json({ error: 'لا يمكن دفع أوردر ملغي' });

    // Use the multi-payment endpoint logic for consistency
    const payAmount = amount != null ? Number(amount) : order.total;
    if (!isFinite(payAmount) || payAmount <= 0) {
      return res.status(400).json({ error: 'قيمة الدفعة يجب أن تكون أكبر من صفر' });
    }
    // F-E: tip is collected alongside the payment but flows to cashier, not revenue.
    // It's stored on the Payment row (and added up to Order.tip) so reports can exclude it.
    const tipNum = round2(Math.max(0, Number(tip) || 0));
    const currentPaid = round2(order.payments.reduce((s, p) => s + Number(p.amount), 0));
    const remaining = round2(order.total - currentPaid);
    if (round2(payAmount - remaining) > 0.001) {
      return res.status(400).json({ error: 'قيمة الدفعة تتجاوز المتبقي', remaining, attempted: round2(payAmount) });
    }

    // Wrap in transaction so payment + order update + customer sync + audit log
    // are atomic. Without the transaction a failure mid-way would leave paidAmount
    // out of sync with the actual Payment rows.
    const result = await db.$transaction(async (tx) => {
      const newPayment = await tx.payment.create({
        data: {
          orderId: order.id,
          method: paymentMethod,
          amount: round2(payAmount),
          tip: tipNum,
          reference: reference || null,
          payerName: payerName || null,
          notes: notes || null,
          receivedById: (req as any).user.userId,
        },
      });

      const totalPaid = round2(currentPaid + payAmount);
      const fullyPaid = round2(totalPaid - order.total) >= 0 && totalPaid > 0;
      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          paymentMethod,
          paidAmount: totalPaid, // ← FIX (P0.1): keep paidAmount in sync with sum of payments
          paymentStatus: fullyPaid ? 'PAID' : 'PARTIAL',
          status: fullyPaid ? 'COMPLETED' : order.status,
          completedAt: fullyPaid ? new Date() : order.completedAt,
          // F-E: add this payment's tip to the order's running tip total
          tip: { increment: tipNum },
        },
        include: {
          items: { include: { product: true } },
          payments: true,
          user: { select: { id: true, name: true } },
          table: true,
          deliveryOptions: { include: { deliveryOption: true } },
        },
      });
      if (fullyPaid && updated.tableId) {
        await tx.table.update({ where: { id: updated.tableId }, data: { status: 'AVAILABLE' } });
      }
      // P1.3: re-sync the customer's outstanding total so the debt list stays accurate
      if (updated.customerId) await syncCustomerTotals(tx, updated.customerId);
      // P0.2: audit log
      await writeAudit(tx, (req as any).user.userId, AUDIT.PAYMENT_CREATE, 'Payment', newPayment.id, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        method: paymentMethod,
        amount: round2(payAmount),
        tip: tipNum,
        fullyPaid,
        reference: reference || null,
      });
      return { order: updated, payment: newPayment };
    });
    return res.json({ order: decorateOrder(result.order), payment: result.payment });
  },

  /**
   * Add a payment to an order (supports split/multiple payments)
   * POST /api/orders/:id/payments
   * body: { method, amount, reference?, payerName?, notes? }
   *
   * Rules:
   *  - Order must exist and not be CANCELLED
   *  - Sum of all payments cannot exceed order.total (overpaid blocked)
   *  - When sum === total → auto-mark order as PAID + COMPLETED
   *  - When sum < total → paymentStatus = PARTIAL
   *  - When order is fully paid → table released if DINE_IN
   */
  async addPayment(req: any, res: Response) {
    const { method, amount, tip = 0, reference, payerName, notes } = req.body;
    const validMethods = ['CASH', 'CARD', 'INSTAPAY'] as const;
    if (!isValidPaymentMethod(method)) {
      return res.status(400).json({ error: `طريقة دفع غير صالحة. المسموح: ${validMethods.join(', ')}` });
    }
    const amt = Number(amount);
    if (!isFinite(amt) || amt <= 0) {
      return res.status(400).json({ error: 'قيمة الدفعة يجب أن تكون أكبر من صفر' });
    }
    // F-E: tip support in split payments too
    const tipNum = round2(Math.max(0, Number(tip) || 0));

    const order = await db.order.findUnique({
      where: { id: getParam(req.params.id) },
      include: { payments: true },
    });
    if (!order) return res.status(404).json({ error: 'الأوردر غير موجود' });
    if (order.status === 'CANCELLED') {
      return res.status(400).json({ error: 'لا يمكن إضافة دفعات لأوردر ملغي' });
    }
    if (order.total <= 0) {
      return res.status(400).json({ error: 'إجمالي الأوردر صفر — لا حاجة للدفع' });
    }

    // Compute current paid (recompute from DB to avoid drift)
    const currentPaid = round2(order.payments.reduce((s, p) => s + Number(p.amount), 0));
    const remaining = round2(order.total - currentPaid);

    if (round2(amt - remaining) > 0.001) {
      return res.status(400).json({
        error: `قيمة الدفعة تتجاوز المتبقي`,
        remaining,
        attempted: round2(amt),
      });
    }

    // Create payment + update order
    const result = await db.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          orderId: order.id,
          method,
          amount: round2(amt),
          tip: tipNum,
          reference: reference || null,
          payerName: payerName || null,
          notes: notes || null,
          receivedById: req.user.userId,
        },
      });

      const newPaid = round2(currentPaid + amt);
      const newRemaining = round2(order.total - newPaid);
      const isFullyPaid = newRemaining <= 0.001;

      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          paidAmount: newPaid,
          paymentStatus: isFullyPaid ? 'PAID' : 'PARTIAL',
          paymentMethod: isFullyPaid ? method : (order.paymentMethod || 'SPLIT'),
          status: isFullyPaid ? 'COMPLETED' : order.status,
          completedAt: isFullyPaid ? new Date() : order.completedAt,
          // F-E: add this payment's tip to the order's running tip total
          tip: { increment: tipNum },
        },
        include: {
          payments: { include: { receivedBy: { select: { id: true, name: true, role: true } } } },
          customer: { select: { id: true, phone: true } },
        },
      });

      if (isFullyPaid && order.tableId) {
        await tx.table.update({ where: { id: order.tableId }, data: { status: 'AVAILABLE' } });
      }

      // P1.3: re-sync customer outstanding (only when there's a linked customer)
      if (updated.customer?.id) {
        await syncCustomerTotals(tx, updated.customer.id);
      }

      // P0.2: audit log
      await writeAudit(tx, req.user.userId, AUDIT.PAYMENT_CREATE, 'Payment', payment.id, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        method,
        amount: round2(amt),
        tip: tipNum,
        isFullyPaid,
        reference: reference || null,
      });

      return { payment, order: updated };
    });

    return res.json({
      payment: result.payment,
      order: result.order,
      summary: {
        total: order.total,
        paid: round2(currentPaid + amt),
        remaining: round2(order.total - (currentPaid + amt)),
        isFullyPaid: result.order.paymentStatus === 'PAID',
      },
    });
  },

  /**
   * Get all payments for an order
   * GET /api/orders/:id/payments
   *
   * Returns each payment with a `refundedAmount` and `remaining` so the frontend
   * can pre-fill refund amounts correctly.
   */
  async getPayments(req: Request, res: Response) {
    const orderId = getParam(req.params.id);
    if (!orderId) return res.status(400).json({ error: 'Invalid order id' });
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: {
        payments: {
          include: { receivedBy: { select: { id: true, name: true, role: true } } },
          orderBy: { createdAt: 'asc' },
        },
        refunds: true,
      },
    });
    if (!order) return res.status(404).json({ error: 'الأوردر غير موجود' });

    // For each payment, sum refunds against it so the UI knows the remaining refundable amount.
    const refundsByPayment = new Map<string, number>();
    for (const r of order.refunds) {
      refundsByPayment.set(r.paymentId, (refundsByPayment.get(r.paymentId) || 0) + r.amount);
    }
    const payments = order.payments.map((p) => {
      const refundedAmount = round2(refundsByPayment.get(p.id) || 0);
      const remaining = round2(Number(p.amount) - refundedAmount);
      return { ...p, refundedAmount, remaining };
    });

    const paid = round2(order.payments.reduce((s: number, p: { amount: number | string }) => s + Number(p.amount), 0));
    const totalRefunded = round2(order.refunds.reduce((s, r) => s + r.amount, 0));
    return res.json({
      payments,
      summary: {
        total: order.total,
        paid,
        refunded: totalRefunded,
        netPaid: round2(paid - totalRefunded),
        remaining: round2(order.total - (paid - totalRefunded)),
        isFullyPaid: paid - totalRefunded >= order.total - 0.001,
        count: order.payments.length,
      },
    });
  },

  /**
   * Remove a payment (manager+ only) - useful for corrections
   * DELETE /api/orders/:id/payments/:paymentId
   */
  async removePayment(req: any, res: Response) {
    if (req.user.role === 'CASHIER' || req.user.role === 'WAITER') {
      return res.status(403).json({ error: 'غير مسموح للكاشير بحذف دفعة' });
    }
    const id = getParam(req.params.id);
    const paymentId = getParam(req.params.paymentId);
    if (!id || !paymentId) return res.status(400).json({ error: 'Invalid payment params' });
    const payment = await db.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.orderId !== id) {
      return res.status(404).json({ error: 'الدفعة غير موجودة' });
    }

    const result = await db.$transaction(async (tx) => {
      await tx.payment.delete({ where: { id: paymentId } });

      const remaining = await tx.payment.findMany({ where: { orderId: id } });
      const newPaid = round2(remaining.reduce((s, p) => s + Number(p.amount), 0));
      const order = await tx.order.findUnique({ where: { id } });
      if (!order) throw new Error('Order vanished');
      const newRemaining = round2(order.total - newPaid);
      const isFullyPaid = newPaid >= order.total - 0.001;

      const updated = await tx.order.update({
        where: { id },
        data: {
          paidAmount: newPaid,
          paymentStatus: isFullyPaid ? 'PAID' : (newPaid > 0 ? 'PARTIAL' : 'UNPAID'),
          status: isFullyPaid ? 'COMPLETED' : (order.status === 'COMPLETED' ? 'SERVED' : order.status),
        },
        include: { payments: true },
      });
      // P0.2: audit log
      await writeAudit(tx, req.user.userId, AUDIT.PAYMENT_REMOVE, 'Payment', paymentId, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        method: payment.method,
        amount: Number(payment.amount),
        newPaidAmount: newPaid,
        newStatus: updated.paymentStatus,
      });
      return updated;
    });

    return res.json({ order: result });
  },

  async remove(req: any, res: Response) {
    // Only managers+ can hard-delete (use cancel() for inventory-safe cancellation)
    if (req.user.role === 'CASHIER' || req.user.role === 'WAITER') {
      return res.status(403).json({ error: 'غير مسموح للكاشير بحذف الأوردر — استخدم الإلغاء' });
    }
    const orderId = getParam(req.params.id);
    if (!orderId) return res.status(400).json({ error: 'Invalid order id' });
    const order = await db.order.findUnique({ where: { id: orderId } });
    if (!order) return res.status(404).json({ error: 'الأوردر غير موجود' });
    if (order.paymentStatus === 'PAID') {
      return res.status(400).json({ error: 'لا يمكن حذف أوردر مدفوع' });
    }
    // HELD orders have never touched stock — straight delete is safe
    if (order.status === 'HELD') {
      await db.order.delete({ where: { id: orderId } });
      return res.json({ message: 'تم حذف الأوردر المعلق' });
    }
    // Restore inventory first via cancel, then hard-delete
    await orderController.cancel({ ...req, body: { status: 'CANCELLED' } }, res);
    return; // cancel already responded
  },
};

export const tableController = {
  async list(req: Request, res: Response) {
    const { branchId, status } = req.query;
    const where: any = {};
    if (branchId) where.branchId = branchId;
    if (status) where.status = status;
    const tables = await db.table.findMany({
      where,
      include: { _count: { select: { orders: true } }, orders: { where: { status: { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED'] } }, take: 1, orderBy: { createdAt: 'desc' } } },
      orderBy: { number: 'asc' },
    });
    return res.json({ tables });
  },

  async create(req: Request, res: Response) {
    const { number, capacity, branchId } = req.body;
    if (!number || !branchId) return res.status(400).json({ error: 'رقم الطاولة والفرع مطلوبان' });
    const table = await db.table.create({ data: { number, capacity: capacity || 4, branchId } });
    return res.status(201).json({ table });
  },

  async update(req: Request, res: Response) {
    const { number, capacity, status } = req.body;
    const tableId = getParam(req.params.id);
    if (!tableId) return res.status(400).json({ error: 'Invalid table id' });
    const table = await db.table.update({ where: { id: tableId }, data: { number, capacity, status } });
    return res.json({ table });
  },

  async remove(req: Request, res: Response) {
    const tableId = getParam(req.params.id);
    if (!tableId) return res.status(400).json({ error: 'Invalid table id' });
    await db.table.delete({ where: { id: tableId } });
    return res.json({ message: 'تم حذف الطاولة' });
  },
};
