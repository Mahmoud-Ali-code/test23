import { Request, Response } from 'express';
import { db } from '../config/prisma';
import { getParam } from '../utils/params';

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export const variantController = {
  /** GET /products/:productId/variants */
  async listByProduct(req: Request, res: Response) {
    const productId = getParam(req.params.productId);
    const variants = await db.productVariant.findMany({
      where: { productId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    return res.json({ variants });
  },

  /** POST /products/:productId/variants */
  async create(req: Request, res: Response) {
    const productId = getParam(req.params.productId);
    const { label, labelAr, price, sortOrder = 0, isActive = true } = req.body;
    if (!label || price == null) return res.status(400).json({ error: 'الاسم والسعر مطلوبين' });
    const v = await db.productVariant.create({
      data: {
        productId,
        label,
        labelAr: labelAr || null,
        price: round2(Number(price)),
        sortOrder: Number(sortOrder) || 0,
        isActive: !!isActive,
      },
    });
    return res.json({ variant: v });
  },

  /** PUT /variants/:id */
  async update(req: Request, res: Response) {
    const id = getParam(req.params.id);
    const data: any = {};
    const { label, labelAr, price, sortOrder, isActive } = req.body;
    if (label !== undefined) data.label = label;
    if (labelAr !== undefined) data.labelAr = labelAr || null;
    if (price !== undefined) data.price = round2(Number(price));
    if (sortOrder !== undefined) data.sortOrder = Number(sortOrder) || 0;
    if (isActive !== undefined) data.isActive = !!isActive;
    const v = await db.productVariant.update({ where: { id }, data });
    return res.json({ variant: v });
  },

  /** DELETE /variants/:id */
  async remove(req: Request, res: Response) {
    const id = getParam(req.params.id);
    await db.productVariant.delete({ where: { id } });
    return res.json({ ok: true });
  },
};
