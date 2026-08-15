import { Request, Response } from 'express';
import { db } from '../config/prisma';
import { hashPassword, comparePassword, generateToken } from '../utils/jwt';

export const authController = {
  async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }
      const user = await db.user.findUnique({ where: { email } });
      if (!user || !user.isActive) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      const valid = await comparePassword(password, user.password);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      const token = generateToken({ userId: user.id, email: user.email, role: user.role });
      return res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          avatar: user.avatar,
          branchId: user.branchId,
        },
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },

  async register(req: Request, res: Response) {
    try {
      const { email, password, name, role, phone, branchId } = req.body;
      if (!email || !password || !name) {
        return res.status(400).json({ error: 'Email, password, and name are required' });
      }
      const exists = await db.user.findUnique({ where: { email } });
      if (exists) {
        return res.status(409).json({ error: 'Email already in use' });
      }
      const hashed = await hashPassword(password);
      const user = await db.user.create({
        data: {
          email,
          password: hashed,
          name,
          role: role || 'CASHIER',
          phone,
          branchId: branchId || null,
        },
      });
      const token = generateToken({ userId: user.id, email: user.email, role: user.role });
      return res.status(201).json({
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role, branchId: user.branchId },
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },

  async me(req: any, res: Response) {
    try {
      const user = await db.user.findUnique({
        where: { id: req.user.userId },
        select: { id: true, email: true, name: true, role: true, avatar: true, phone: true, branchId: true, createdAt: true },
      });
      if (!user) return res.status(404).json({ error: 'User not found' });
      return res.json({ user });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },
};
