import { Request, Response } from 'express';
import { db } from '../config/prisma';
import { getParam } from '../utils/params';

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export const modifierController = {
  /** GET /products/:productId/modifier-groups */
  async listByProduct(req: Request, res: Response) {
    const productId = getParam(req.params.productId);
    const groups = await db.productModifierGroup.findMany({
      where: { productId, isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        options: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
      },
    });
    return res.json({ groups });
  },

  /** POST /products/:productId/modifier-groups */
  async createGroup(req: Request, res: Response) {
    const productId = getParam(req.params.productId);
    const { name, nameAr, type = 'SINGLE', required = false, minSelect = 0, maxSelect = 1, sortOrder = 0 } = req.body;
    if (!name) return res.status(400).json({ error: 'اسم المجموعة مطلوب' });
    const g = await db.productModifierGroup.create({
      data: {
        productId,
        name,
        nameAr: nameAr || null,
        type: type === 'MULTI' ? 'MULTI' : 'SINGLE',
        required: !!required,
        minSelect: Math.max(0, Number(minSelect) || 0),
        maxSelect: Math.max(1, Number(maxSelect) || 1),
        sortOrder: Number(sortOrder) || 0,
      },
    });
    return res.json({ group: g });
  },

  /** PUT /modifier-groups/:id */
  async updateGroup(req: Request, res: Response) {
    const id = getParam(req.params.id);
    const data: any = {};
    const { name, nameAr, type, required, minSelect, maxSelect, sortOrder, isActive } = req.body;
    if (name !== undefined) data.name = name;
    if (nameAr !== undefined) data.nameAr = nameAr || null;
    if (type !== undefined) data.type = type === 'MULTI' ? 'MULTI' : 'SINGLE';
    if (required !== undefined) data.required = !!required;
    if (minSelect !== undefined) data.minSelect = Math.max(0, Number(minSelect) || 0);
    if (maxSelect !== undefined) data.maxSelect = Math.max(1, Number(maxSelect) || 1);
    if (sortOrder !== undefined) data.sortOrder = Number(sortOrder) || 0;
    if (isActive !== undefined) data.isActive = !!isActive;
    const g = await db.productModifierGroup.update({ where: { id }, data });
    return res.json({ group: g });
  },

  /** DELETE /modifier-groups/:id */
  async removeGroup(req: Request, res: Response) {
    const id = getParam(req.params.id);
    await db.productModifierGroup.delete({ where: { id } });
    return res.json({ ok: true });
  },

  /** POST /modifier-groups/:groupId/options */
  async addOption(req: Request, res: Response) {
    const groupId = getParam(req.params.groupId);
    const { label, labelAr, priceDelta = 0, isDefault = false, sortOrder = 0 } = req.body;
    if (!label) return res.status(400).json({ error: 'اسم الخيار مطلوب' });
    const o = await db.modifierOption.create({
      data: {
        groupId,
        label,
        labelAr: labelAr || null,
        priceDelta: round2(Number(priceDelta) || 0),
        isDefault: !!isDefault,
        sortOrder: Number(sortOrder) || 0,
      },
    });
    return res.json({ option: o });
  },

  /** PUT /modifier-options/:id */
  async updateOption(req: Request, res: Response) {
    const id = getParam(req.params.id);
    const data: any = {};
    const { label, labelAr, priceDelta, isDefault, sortOrder, isActive } = req.body;
    if (label !== undefined) data.label = label;
    if (labelAr !== undefined) data.labelAr = labelAr || null;
    if (priceDelta !== undefined) data.priceDelta = round2(Number(priceDelta) || 0);
    if (isDefault !== undefined) data.isDefault = !!isDefault;
    if (sortOrder !== undefined) data.sortOrder = Number(sortOrder) || 0;
    if (isActive !== undefined) data.isActive = !!isActive;
    const o = await db.modifierOption.update({ where: { id }, data });
    return res.json({ option: o });
  },

  /** DELETE /modifier-options/:id */
  async removeOption(req: Request, res: Response) {
    const id = getParam(req.params.id);
    await db.modifierOption.delete({ where: { id } });
    return res.json({ ok: true });
  },
};
