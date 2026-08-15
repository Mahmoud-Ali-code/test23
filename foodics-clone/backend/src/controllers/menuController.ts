import { Request, Response } from 'express';
import { db } from '../config/prisma';
import { cache, invalidate, TTL } from '../utils/cache';
import { getParam } from '../utils/params';

export const categoryController = {
  async list(req: Request, res: Response) {
    const categories = await cache('categories:all', TTL.CATEGORIES, async () => {
      return db.category.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        include: { _count: { select: { products: true } } },
      });
    });
    return res.json({ categories });
  },

  async get(req: Request, res: Response) {
    const category = await db.category.findUnique({
      where: { id: getParam(req.params.id) },
      include: { products: { where: { isActive: true } } },
    });
    if (!category) return res.status(404).json({ error: 'Category not found' });
    return res.json({ category });
  },

  async create(req: Request, res: Response) {
    const { name, nameAr, image, sortOrder } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const category = await db.category.create({ data: { name, nameAr, image, sortOrder: sortOrder || 0 } });
    await invalidate('categories:all');
    return res.status(201).json({ category });
  },

  async update(req: Request, res: Response) {
    const { name, nameAr, image, sortOrder, isActive } = req.body;
    const category = await db.category.update({
      where: { id: getParam(req.params.id) },
      data: { name, nameAr, image, sortOrder, isActive },
    });
    await invalidate('categories:all');
    return res.json({ category });
  },

  async remove(req: Request, res: Response) {
    await db.category.delete({ where: { id: getParam(req.params.id) } });
    await invalidate('categories:all');
    return res.json({ message: 'Category deleted' });
  },
};

export const productController = {
  async list(req: Request, res: Response) {
    const { categoryId, search, available } = req.query;
    const cacheKey = `products:${categoryId || 'all'}:${search || ''}:${available || ''}`;
    const products = await cache(cacheKey, TTL.PRODUCTS, async () => {
      const where: any = { isActive: true };
      if (categoryId) where.categoryId = categoryId;
      if (search) where.OR = [
        { name: { contains: String(search) } },
        { nameAr: { contains: String(search) } },
        { sku: { contains: String(search) } },
        { barcode: { contains: String(search) } },
      ];
      if (available === 'true') where.isAvailable = true;
      return db.product.findMany({
        where,
        include: {
          category: true,
          inventory: true,
          variants: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
          modifierGroups: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
            include: { options: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
    });
    return res.json({ products });
  },

  async get(req: Request, res: Response) {
    const product = await db.product.findUnique({
      where: { id: getParam(req.params.id) },
      include: {
        category: true,
        ingredients: { include: { ingredient: true } },
        inventory: true,
        variants: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        modifierGroups: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          include: { options: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    return res.json({ product });
  },

  async create(req: Request, res: Response) {
    const { name, nameAr, description, image, price, cost, sku, barcode, categoryId, sortOrder, stock, minStock, unit } = req.body;
    if (!name || !price || !categoryId) {
      return res.status(400).json({ error: 'name, price, and categoryId are required' });
    }
    const product = await db.product.create({
      data: {
        name, nameAr, description, image,
        price: parseFloat(price),
        cost: cost ? parseFloat(cost) : 0,
        sku, barcode,
        categoryId,
        sortOrder: sortOrder || 0,
        inventory: {
          create: {
            stock: stock || 0,
            minStock: minStock || 5,
            unit: unit || 'pcs',
          },
        },
      },
      include: { category: true, inventory: true },
    });
    await invalidate('products:*');
    return res.status(201).json({ product });
  },

  async update(req: Request, res: Response) {
    const { name, nameAr, description, image, price, cost, sku, barcode, categoryId, sortOrder, isActive, isAvailable, stock, minStock } = req.body;
    const product = await db.product.update({
      where: { id: getParam(req.params.id) },
      data: {
        name, nameAr, description, image,
        price: price !== undefined ? parseFloat(price) : undefined,
        cost: cost !== undefined ? parseFloat(cost) : undefined,
        sku, barcode,
        categoryId,
        sortOrder,
        isActive,
        isAvailable,
      },
      include: { category: true, inventory: true },
    });
    if (stock !== undefined || minStock !== undefined) {
      await db.inventory.upsert({
        where: { productId: product.id },
        create: { productId: product.id, stock: stock || 0, minStock: minStock || 5 },
        update: { ...(stock !== undefined && { stock: parseFloat(stock) }), ...(minStock !== undefined && { minStock: parseFloat(minStock) }) },
      });
    }
    await invalidate('products:*');
    return res.json({ product });
  },

  async remove(req: Request, res: Response) {
    await db.product.delete({ where: { id: getParam(req.params.id) } });
    await invalidate('products:*');
    return res.json({ message: 'Product deleted' });
  },
};
