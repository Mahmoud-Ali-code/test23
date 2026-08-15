import { Request, Response } from 'express';
import { db } from '../config/prisma';
import { getParam } from '../utils/params';
import { EXPENSE_METHODS, isValidExpenseMethod } from '../utils/paymentMethods';
import { writeAudit, AUDIT } from '../utils/auditLog';

type InventoryParams = { id?: string; productId?: string };

export const inventoryController = {
  async list(req: Request<InventoryParams>, res: Response) {
    const { lowStock } = req.query;
    const inventory = await db.inventory.findMany({
      include: { product: { include: { category: true } } },
      orderBy: { stock: 'asc' },
    });
    const filtered = lowStock === 'true' ? inventory.filter((i) => i.stock <= i.minStock) : inventory;
    return res.json({ inventory: filtered });
  },

  async adjust(req: any, res: Response) {
    const productId = getParam(req.params.productId);
    const { type, quantity, reason } = req.body;
    if (!productId) return res.status(400).json({ error: 'Product ID required' });
    if (!['IN', 'OUT', 'ADJUSTMENT'].includes(type)) {
      return res.status(400).json({ error: 'نوع غير صالح' });
    }
    const qty = parseFloat(quantity);
    if (isNaN(qty)) return res.status(400).json({ error: 'كمية غير صالحة' });

    const inventory = await db.inventory.findUnique({ where: { productId } });
    if (!inventory) return res.status(404).json({ error: 'المخزون غير موجود' });

    let newStock = inventory.stock;
    if (type === 'IN') newStock += qty;
    else if (type === 'OUT') newStock -= qty;
    else newStock = qty;

    await db.inventory.update({ where: { productId }, data: { stock: newStock } });
    await db.inventoryMovement.create({
      data: { type, quantity: qty, reason, productId },
    });
    // P0.2: audit log for inventory changes (especially ADJUSTMENT which is a manual override)
    await writeAudit(db, req.user?.userId, AUDIT.INVENTORY_ADJUST, 'Inventory', productId, {
      type,
      quantity: qty,
      reason: reason || null,
      previousStock: inventory.stock,
      newStock,
    });
    return res.json({ inventory: { ...inventory, stock: newStock } });
  },

  async movements(req: Request, res: Response) {
    // F-G: filterable inventory movement log.
    // Supports filtering by type (IN/OUT/ADJUSTMENT), productId, ingredientId, and date range.
    // Cursor-based pagination (same pattern as /audit) so we don't skip rows during writes.
    const { type, productId, ingredientId, startDate, endDate, cursor, limit = '50' } = req.query as any;
    const where: any = {};
    if (type) where.type = type;
    if (productId) where.productId = productId;
    if (ingredientId) where.ingredientId = ingredientId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }
    if (cursor) {
      where.id = { lt: cursor }; // descending order, so older rows have smaller IDs (UUIDs roughly time-ordered)
    }
    const take = Math.min(200, Math.max(1, parseInt(limit as string) || 50));
    const rows = await db.inventoryMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: take + 1,
    });
    const hasMore = rows.length > take;
    const movements = hasMore ? rows.slice(0, take) : rows;
    const nextCursor = hasMore ? movements[movements.length - 1].id : null;

    // Hydrate product / ingredient names in one shot to avoid N+1
    const productIds = [...new Set(movements.map((m) => m.productId).filter(Boolean) as string[])];
    const ingredientIds = [...new Set(movements.map((m) => m.ingredientId).filter(Boolean) as string[])];
    const [products, ingredients] = await Promise.all([
      productIds.length ? db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, nameAr: true } }) : [],
      ingredientIds.length ? db.ingredient.findMany({ where: { id: { in: ingredientIds } }, select: { id: true, name: true, nameAr: true } }) : [],
    ]);
    const productMap = new Map(products.map((p) => [p.id, p]));
    const ingredientMap = new Map(ingredients.map((i) => [i.id, i]));

    const enriched = movements.map((m: any) => ({
      ...m,
      product: m.productId ? productMap.get(m.productId) || null : null,
      ingredient: m.ingredientId ? ingredientMap.get(m.ingredientId) || null : null,
    }));

    return res.json({ movements: enriched, hasMore, nextCursor });
  },

  // Ingredients
  async listIngredients(req: Request, res: Response) {
    const ingredients = await db.ingredient.findMany({
      include: { supplier: true, _count: { select: { products: true, recipe: true } } },
      orderBy: { name: 'asc' },
    });
    return res.json({ ingredients });
  },

  async createIngredient(req: Request, res: Response) {
    const { name, nameAr, unit, stock, minStock, cost, supplierId } = req.body;
    if (!name || !unit) return res.status(400).json({ error: 'الاسم والوحدة مطلوبان' });
    const ingredient = await db.ingredient.create({
      data: {
        name, nameAr, unit, stock: stock || 0, minStock: minStock || 0, cost: cost || 0,
        supplierId: supplierId || null,
      },
    });
    return res.status(201).json({ ingredient });
  },

  async updateIngredient(req: Request<InventoryParams>, res: Response) {
    const id = getParam(req.params.id);
    const { name, nameAr, unit, stock, minStock, cost, supplierId } = req.body;
    if (!id) return res.status(400).json({ error: 'Ingredient ID required' });
    const ingredient = await db.ingredient.update({
      where: { id },
      data: { name, nameAr, unit, stock, minStock, cost, supplierId },
    });
    return res.json({ ingredient });
  },

  async deleteIngredient(req: Request<InventoryParams>, res: Response) {
    const id = getParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Ingredient ID required' });
    await db.ingredient.delete({ where: { id } });
    return res.json({ message: 'تم حذف المكون' });
  },

  // Recipe management
  async getRecipe(req: Request<InventoryParams>, res: Response) {
    const productId = getParam(req.params.productId);
    if (!productId) return res.status(400).json({ error: 'Product ID required' });
    const recipe = await db.recipe.findMany({
      where: { productId },
      include: { ingredient: true },
    });
    return res.json({ recipe });
  },

  async setRecipe(req: Request<InventoryParams>, res: Response) {
    const productId = getParam(req.params.productId);
    const { items } = req.body; // [{ ingredientId, quantity }]
    if (!productId) return res.status(400).json({ error: 'Product ID required' });
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items array required' });
    // Delete old recipe
    await db.recipe.deleteMany({ where: { productId } });
    // Create new
    const created = await db.recipe.createMany({
      data: items.map((i: any) => ({
        productId,
        ingredientId: i.ingredientId,
        quantity: parseFloat(i.quantity),
      })),
    });
    return res.json({ message: 'تم حفظ الريسبي', count: created.count });
  },
};

const VALID_EXPENSE_METHODS = EXPENSE_METHODS;

export const expenseController = {
  async list(req: Request, res: Response) {
    const expenses = await db.expense.findMany({
      orderBy: { date: 'desc' },
      take: 200,
      include: { supplier: { select: { id: true, nameAr: true, name: true } } },
    });
    // Break down by payment method for the UI
    const byMethod: Record<string, number> = Object.fromEntries(VALID_EXPENSE_METHODS.map((m) => [m, 0]));
    for (const e of expenses) {
      if (byMethod[e.paymentMethod] !== undefined) byMethod[e.paymentMethod] += e.amount;
    }
    return res.json({ expenses, byMethod, count: expenses.length, total: expenses.reduce((s, e) => s + e.amount, 0) });
  },
  async create(req: any, res: Response) {
    const { category, description, amount, date, branchId, paymentMethod, supplierId, reference } = req.body;
    if (!category || !description || !amount) {
      return res.status(400).json({ error: 'الفئة والوصف والمبلغ مطلوبة' });
    }
    const amt = parseFloat(amount);
    if (!isFinite(amt) || amt <= 0) {
      return res.status(400).json({ error: 'المبلغ يجب أن يكون رقماً موجباً' });
    }
    const method = paymentMethod || 'CASH';
    if (!isValidExpenseMethod(method)) {
      return res.status(400).json({ error: `طريقة دفع غير صالحة. المسموح: ${VALID_EXPENSE_METHODS.join(', ')}` });
    }
    const expense = await db.expense.create({
      data: {
        category,
        description,
        amount: amt,
        date: date ? new Date(date) : new Date(),
        branchId: branchId || null,
        paymentMethod: method,
        supplierId: supplierId || null,
        reference: reference || null,
      },
    });
    // P0.2: audit log
    await writeAudit(db, req.user?.userId, AUDIT.EXPENSE_CREATE, 'Expense', expense.id, {
      category,
      amount: amt,
      paymentMethod: method,
      supplierId: supplierId || null,
    });
    return res.status(201).json({ expense });
  },
  async update(req: any, res: Response) {
    const id = getParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const { category, description, amount, date, paymentMethod, supplierId, reference } = req.body;
    if (paymentMethod && !isValidExpenseMethod(paymentMethod)) {
      return res.status(400).json({ error: `طريقة دفع غير صالحة. المسموح: ${VALID_EXPENSE_METHODS.join(', ')}` });
    }
    // Snapshot before for the audit diff
    const before = await db.expense.findUnique({ where: { id } });
    const expense = await db.expense.update({
      where: { id },
      data: {
        ...(category !== undefined ? { category } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(amount !== undefined ? { amount: parseFloat(amount) } : {}),
        ...(date !== undefined ? { date: new Date(date) } : {}),
        ...(paymentMethod !== undefined ? { paymentMethod } : {}),
        ...(supplierId !== undefined ? { supplierId: supplierId || null } : {}),
        ...(reference !== undefined ? { reference } : {}),
      },
    });
    // P0.2: audit log
    await writeAudit(db, req.user?.userId, AUDIT.EXPENSE_UPDATE, 'Expense', expense.id, {
      before: before ? { amount: Number(before.amount), category: before.category, paymentMethod: before.paymentMethod } : null,
      after: { amount: Number(expense.amount), category: expense.category, paymentMethod: expense.paymentMethod },
    });
    return res.json({ expense });
  },
  async remove(req: any, res: Response) {
    const id = getParam(req.params.id);
    const before = await db.expense.findUnique({ where: { id } });
    await db.expense.delete({ where: { id } });
    // P0.2: audit log
    if (before) {
      await writeAudit(db, req.user?.userId, AUDIT.EXPENSE_REMOVE, 'Expense', id, {
        category: before.category,
        amount: Number(before.amount),
        paymentMethod: before.paymentMethod,
      });
    }
    return res.json({ message: 'تم حذف المصروف' });
  },
};

// ============== SUPPLIERS ==============
export const supplierController = {
  async list(req: Request, res: Response) {
    const suppliers = await db.supplier.findMany({
      where: { isActive: true },
      include: { _count: { select: { invoices: true, ingredients: true } } },
      orderBy: { name: 'asc' },
    });
    return res.json({ suppliers });
  },
  async create(req: Request, res: Response) {
    const { name, nameAr, phone, email, address, notes, branchId } = req.body;
    if (!name) return res.status(400).json({ error: 'اسم المورد مطلوب' });
    const supplier = await db.supplier.create({ data: { name, nameAr, phone, email, address, notes, branchId } });
    return res.status(201).json({ supplier });
  },
  async update(req: Request, res: Response) {
    const supplier = await db.supplier.update({ where: { id: getParam(req.params.id) }, data: req.body });
    return res.json({ supplier });
  },
  async remove(req: Request, res: Response) {
    await db.supplier.update({ where: { id: getParam(req.params.id) }, data: { isActive: false } });
    return res.json({ message: 'تم إلغاء تفعيل المورد' });
  },
};

// ============== SUPPLIER INVOICES ==============
export const invoiceController = {
  async list(req: Request, res: Response) {
    const { supplierId, status } = req.query;
    const where: any = {};
    if (supplierId) where.supplierId = supplierId;
    if (status) where.status = status;
    const invoices = await db.supplierInvoice.findMany({
      where,
      include: { supplier: true, items: { include: { ingredient: true } } },
      orderBy: { date: 'desc' },
    });
    return res.json({ invoices });
  },
  async create(req: Request, res: Response) {
    const { number, supplierId, amount, paid, date, dueDate, notes, branchId, items } = req.body;
    if (!supplierId || !amount) return res.status(400).json({ error: 'المورد والمبلغ مطلوبان' });
    const invoice = await db.supplierInvoice.create({
      data: {
        number: number || `INV-${Date.now()}`,
        supplierId,
        amount: parseFloat(amount),
        paid: paid || 0,
        status: paid >= amount ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID',
        date: date ? new Date(date) : new Date(),
        dueDate: dueDate ? new Date(dueDate) : null,
        notes,
        branchId,
        items: items ? { create: items.map((i: any) => ({
          ingredientId: i.ingredientId || null,
          description: i.description,
          quantity: parseFloat(i.quantity || 0),
          unit: i.unit || 'pcs',
          unitPrice: parseFloat(i.unitPrice || 0),
          total: parseFloat(i.total || (i.quantity * i.unitPrice) || 0),
        })) } : undefined,
      },
      include: { supplier: true, items: { include: { ingredient: true } } },
    });
    return res.status(201).json({ invoice });
  },
  async update(req: Request, res: Response) {
    const { paid, status, notes } = req.body;
    const invoiceId = getParam(req.params.id);
    if (!invoiceId) return res.status(400).json({ error: 'Invalid invoice id' });
    const invoice = await db.supplierInvoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) return res.status(404).json({ error: 'الفاتورة غير موجودة' });
    const newPaid = paid !== undefined ? paid : invoice.paid;
    const newStatus = status || (newPaid >= invoice.amount ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'UNPAID');
    const updated = await db.supplierInvoice.update({
      where: { id: invoiceId },
      data: { paid: newPaid, status: newStatus, notes },
      include: { supplier: true, items: true },
    });
    return res.json({ invoice: updated });
  },
  async remove(req: Request, res: Response) {
    await db.supplierInvoice.delete({ where: { id: getParam(req.params.id) } });
    return res.json({ message: 'تم حذف الفاتورة' });
  },
};

// ============== DELIVERY OPTIONS ==============
export const deliveryController = {
  async list(req: Request, res: Response) {
    const options = await db.deliveryOption.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    return res.json({ options });
  },
  async create(req: any, res: Response) {
    const { name, nameAr, description, fee, allowCustomFee, minFee, maxFee } = req.body;
    if (!name || !nameAr) return res.status(400).json({ error: 'الاسم بالعربي والإنجليزي مطلوب' });
    // F-H custom fee: validate the min/max range
    if (allowCustomFee) {
      if (minFee != null && maxFee != null && Number(minFee) > Number(maxFee)) {
        return res.status(400).json({ error: 'الحد الأدنى لازم يكون أقل من الحد الأقصى' });
      }
      if (minFee != null && Number(minFee) < 0) {
        return res.status(400).json({ error: 'الحد الأدنى مش ممكن يكون سالب' });
      }
      if (maxFee != null && Number(maxFee) < 0) {
        return res.status(400).json({ error: 'الحد الأقصى مش ممكن يكون سالب' });
      }
    }
    const option = await db.deliveryOption.create({
      data: {
        name,
        nameAr,
        description: description || null,
        fee: Number(fee) || 0,
        allowCustomFee: !!allowCustomFee,
        minFee: minFee != null ? Number(minFee) : null,
        maxFee: maxFee != null ? Number(maxFee) : null,
      },
    });
    return res.status(201).json({ option });
  },
  async update(req: any, res: Response) {
    const optionId = getParam(req.params.id);
    if (!optionId) return res.status(400).json({ error: 'Invalid delivery option id' });
    const { name, nameAr, description, fee, allowCustomFee, minFee, maxFee, isActive } = req.body;
    // Only allow specific fields through (avoid arbitrary updates)
    const data: any = {};
    if (name !== undefined) data.name = String(name).trim();
    if (nameAr !== undefined) data.nameAr = String(nameAr).trim();
    if (description !== undefined) data.description = description || null;
    if (fee !== undefined) data.fee = Number(fee) || 0;
    if (allowCustomFee !== undefined) data.allowCustomFee = !!allowCustomFee;
    if (minFee !== undefined) data.minFee = minFee != null ? Number(minFee) : null;
    if (maxFee !== undefined) data.maxFee = maxFee != null ? Number(maxFee) : null;
    if (isActive !== undefined) data.isActive = !!isActive;
    if (Object.keys(data).length === 0) return res.status(400).json({ error: 'لا يوجد حقول للتحديث' });
    if (data.allowCustomFee) {
      if (data.minFee != null && data.maxFee != null && data.minFee > data.maxFee) {
        return res.status(400).json({ error: 'الحد الأدنى لازم يكون أقل من الحد الأقصى' });
      }
    }
    const option = await db.deliveryOption.update({ where: { id: optionId }, data });
    return res.json({ option });
  },
  async remove(req: Request, res: Response) {
    const optionId = getParam(req.params.id);
    if (!optionId) return res.status(400).json({ error: 'Invalid delivery option id' });
    await db.deliveryOption.update({ where: { id: optionId }, data: { isActive: false } });
    return res.json({ message: 'تم إلغاء التفعيل' });
  },
};

export const branchController = {
  async list(req: Request, res: Response) {
    const branches = await db.branch.findMany({
      where: { isActive: true },
      include: { _count: { select: { users: true, tables: true, orders: true } } },
    });
    return res.json({ branches });
  },
  async create(req: Request, res: Response) {
    const { name, nameAr, address, phone } = req.body;
    if (!name) return res.status(400).json({ error: 'اسم الفرع مطلوب' });
    const branch = await db.branch.create({ data: { name, nameAr, address, phone } });
    return res.status(201).json({ branch });
  },
  async update(req: any, res: Response) {
    const branchId = getParam(req.params.id);
    if (!branchId) return res.status(400).json({ error: 'Invalid branch id' });
    // F-H: validate the F-I tax fields and business hours before persisting.
    // We only allow fields the admin is supposed to set — anything else in req.body
    // is rejected so a typo'd field doesn't quietly change behavior.
    const allowed: any = {};
    const { name, nameAr, address, phone, taxRateDineIn, taxRateTakeaway, taxRateDelivery, businessDayStartHour, businessDayEndHour } = req.body || {};
    if (name !== undefined) allowed.name = String(name).trim();
    if (nameAr !== undefined) allowed.nameAr = String(nameAr).trim() || null;
    if (address !== undefined) allowed.address = String(address).trim() || null;
    if (phone !== undefined) allowed.phone = String(phone).trim() || null;
    if (taxRateDineIn !== undefined) {
      const n = parseFloat(taxRateDineIn);
      if (!isFinite(n) || n < 0 || n > 1) return res.status(400).json({ error: 'ضريبة الصالة يجب أن تكون بين 0 و 1' });
      allowed.taxRateDineIn = n;
    }
    if (taxRateTakeaway !== undefined) {
      const n = parseFloat(taxRateTakeaway);
      if (!isFinite(n) || n < 0 || n > 1) return res.status(400).json({ error: 'ضريبة التيك أواي يجب أن تكون بين 0 و 1' });
      allowed.taxRateTakeaway = n;
    }
    if (taxRateDelivery !== undefined) {
      const n = parseFloat(taxRateDelivery);
      if (!isFinite(n) || n < 0 || n > 1) return res.status(400).json({ error: 'ضريبة التوصيل يجب أن تكون بين 0 و 1' });
      allowed.taxRateDelivery = n;
    }
    if (businessDayStartHour !== undefined) {
      const n = parseInt(businessDayStartHour);
      if (!isFinite(n) || n < 0 || n > 23) return res.status(400).json({ error: 'ساعة بداية اليوم يجب أن تكون بين 0 و 23' });
      allowed.businessDayStartHour = n;
    }
    if (businessDayEndHour !== undefined) {
      const n = parseInt(businessDayEndHour);
      if (!isFinite(n) || n < 0 || n > 23) return res.status(400).json({ error: 'ساعة نهاية اليوم يجب أن تكون بين 0 و 23' });
      allowed.businessDayEndHour = n;
    }
    if (Object.keys(allowed).length === 0) {
      return res.status(400).json({ error: 'لا يوجد حقول قابلة للتحديث' });
    }
    const before = await db.branch.findUnique({ where: { id: branchId } });
    const branch = await db.branch.update({ where: { id: branchId }, data: allowed });
    await writeAudit(db, req.user?.userId, AUDIT.BRANCH_UPDATE, 'Branch', branchId, {
      previous: before ? {
        taxRateDineIn: before.taxRateDineIn,
        taxRateTakeaway: before.taxRateTakeaway,
        taxRateDelivery: before.taxRateDelivery,
        businessDayStartHour: before.businessDayStartHour,
        businessDayEndHour: before.businessDayEndHour,
      } : null,
      next: allowed,
    });
    return res.json({ branch });
  },
  async remove(req: Request, res: Response) {
    const branchId = getParam(req.params.id);
    if (!branchId) return res.status(400).json({ error: 'Invalid branch id' });
    await db.branch.update({ where: { id: branchId }, data: { isActive: false } });
    return res.json({ message: 'تم إلغاء تفعيل الفرع' });
  },
};

export const userController = {
  async list(req: Request, res: Response) {
    const users = await db.user.findMany({
      select: { id: true, email: true, name: true, role: true, isActive: true, phone: true, avatar: true, branchId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ users });
  },
  async create(req: Request, res: Response) {
    const { email, password, name, role, phone, branchId } = req.body;
    const { hashPassword } = await import('../utils/jwt');
    const hashed = await hashPassword(password);
    const user = await db.user.create({
      data: { email, password: hashed, name, role, phone, branchId },
      select: { id: true, email: true, name: true, role: true, isActive: true, phone: true, branchId: true },
    });
    return res.status(201).json({ user });
  },
  async update(req: Request, res: Response) {
    const { name, role, phone, isActive, branchId, avatar } = req.body;
    const userId = getParam(req.params.id);
    if (!userId) return res.status(400).json({ error: 'Invalid user id' });
    const user = await db.user.update({
      where: { id: userId },
      data: { name, role, phone, isActive, branchId, avatar },
      select: { id: true, email: true, name: true, role: true, isActive: true, phone: true, branchId: true },
    });
    return res.json({ user });
  },
  async remove(req: Request, res: Response) {
    const userId = getParam(req.params.id);
    if (!userId) return res.status(400).json({ error: 'Invalid user id' });
    await db.user.update({ where: { id: userId }, data: { isActive: false } });
    return res.json({ message: 'تم إلغاء تفعيل الموظف' });
  },
};
