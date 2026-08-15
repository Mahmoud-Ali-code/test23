import { Request, Response } from 'express';
import { db } from '../config/prisma';

const round2 = (n: number): number => Math.round(n * 100) / 100;

export const reportController = {
  async dashboard(req: Request, res: Response) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const [
        todayOrders,
        todayRevenueGross,
        todayRefunds,
        todayCustomers,
        pendingOrders,
        lowStock,
        topProducts,
        recentOrders,
        weekRevenueGross,
        weekRefunds,
        monthRevenueGross,
        monthRefunds,
      ] = await Promise.all([
        db.order.count({ where: { createdAt: { gte: today, lt: tomorrow } } }),
        // Gross revenue: sum of PAID orders' totals. Refunds handled separately below.
        db.order.aggregate({
          where: { createdAt: { gte: today, lt: tomorrow }, paymentStatus: 'PAID' },
          _sum: { total: true },
        }),
        // Refunds issued today
        db.refund.aggregate({
          where: { createdAt: { gte: today, lt: tomorrow } },
          _sum: { amount: true },
        }),
        db.order.findMany({ where: { createdAt: { gte: today, lt: tomorrow } }, select: { customerPhone: true } }).then((arr) => new Set(arr.map((o) => o.customerPhone).filter(Boolean)).size),
        db.order.count({ where: { status: { in: ['PENDING', 'CONFIRMED', 'PREPARING'] } } }),
        db.inventory.findMany({
          include: { product: true },
          take: 50,
        }).then((arr) => arr.filter((i) => i.stock <= i.minStock).slice(0, 10)),
        db.orderItem.groupBy({
          by: ['productId'],
          _sum: { quantity: true },
          _count: { id: true },
          where: { order: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } },
          orderBy: { _sum: { quantity: 'desc' } },
          take: 5,
        }),
        db.order.findMany({
          include: { items: { include: { product: true } }, user: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        db.order.aggregate({
          where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, paymentStatus: 'PAID' },
          _sum: { total: true },
        }),
        db.refund.aggregate({
          where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
          _sum: { amount: true },
        }),
        db.order.aggregate({
          where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, paymentStatus: 'PAID' },
          _sum: { total: true },
        }),
        db.refund.aggregate({
          where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
          _sum: { amount: true },
        }),
      ]);

      // Enrich top products (filter out null productIds from combo lines)
      const productIds = topProducts.map((tp) => tp.productId).filter((id): id is string => !!id);
      const products = productIds.length
        ? await db.product.findMany({ where: { id: { in: productIds } } })
        : [];
      const topProductsEnriched = topProducts
        .filter((tp) => !!tp.productId)
        .map((tp) => {
          const product = products.find((p) => p.id === tp.productId);
          return { ...tp, product };
        });

      const net = (gross: any, refunds: any) => Number(gross?._sum?.total || 0) - Number(refunds?._sum?.amount || 0);
      return res.json({
        stats: {
          todayOrders,
          todayRevenue: net(todayRevenueGross, todayRefunds),
          todayGross: Number(todayRevenueGross?._sum?.total || 0),
          todayRefunds: Number(todayRefunds?._sum?.amount || 0),
          todayCustomers,
          pendingOrders,
          weekRevenue: net(weekRevenueGross, weekRefunds),
          weekRefunds: Number(weekRefunds?._sum?.amount || 0),
          monthRevenue: net(monthRevenueGross, monthRefunds),
          monthRefunds: Number(monthRefunds?._sum?.amount || 0),
        },
        topProducts: topProductsEnriched,
        recentOrders,
        lowStock,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },

  async salesByDay(req: Request, res: Response) {
    try {
      const days = parseInt(req.query.days as string) || 7;
      // Build bucket dates in LOCAL time so they match dashboard's "today" (which uses
      // setHours(0,0,0,0) — local). process.env.TZ is set at startup (Africa/Cairo by default).
      // Previously this used Date.UTC and got "today" off by up to 24h in non-UTC regions.
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const startStart = new Date(todayStart);
      startStart.setDate(startStart.getDate() - (days - 1));

      // Query window (local midnight to next local midnight, inclusive)
      const end = new Date(todayStart);
      end.setDate(end.getDate() + 1);
      end.setMilliseconds(end.getMilliseconds() - 1);

      const [orders, refunds] = await Promise.all([
        db.order.findMany({
          where: { createdAt: { gte: startStart, lte: end }, paymentStatus: 'PAID' },
          select: { total: true, tax: true, discount: true, subtotal: true, createdAt: true, status: true },
        }),
        // Refunds bucket by their createdAt (when the money was actually returned)
        db.refund.findMany({
          where: { createdAt: { gte: startStart, lte: end } },
          select: { amount: true, createdAt: true },
        }),
      ]);

      const keyOf = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      const buckets: Record<string, { date: string; orders: number; gross: number; revenue: number; refunds: number; net: number }> = {};
      for (let i = 0; i < days; i++) {
        const d = new Date(startStart);
        d.setDate(d.getDate() + i);
        const key = keyOf(d);
        buckets[key] = { date: key, orders: 0, gross: 0, revenue: 0, refunds: 0, net: 0 };
      }
      orders.forEach((o) => {
        const key = keyOf(new Date(o.createdAt));
        if (buckets[key]) {
          buckets[key].orders += 1;
          buckets[key].gross += o.total;
          buckets[key].revenue += o.total; // alias for backwards compat
        }
      });
      refunds.forEach((r) => {
        const key = keyOf(new Date(r.createdAt));
        if (buckets[key]) {
          buckets[key].refunds += r.amount;
        }
      });
      for (const b of Object.values(buckets)) {
        b.gross = round2(b.gross);
        b.revenue = round2(b.revenue);
        b.refunds = round2(b.refunds);
        b.net = round2(b.gross - b.refunds);
      }
      return res.json({ series: Object.values(buckets) });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },

  async topProducts(req: Request, res: Response) {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const top = await db.orderItem.groupBy({
        by: ['productId'],
        _sum: { quantity: true, price: true },
        _count: { id: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: limit,
        // Filter out combo lines (productId: null) — they don't belong to a real product
        where: { productId: { not: null } },
      });
      const productIds = top.map((t) => t.productId).filter((id): id is string => !!id);
      const products = productIds.length
        ? await db.product.findMany({ where: { id: { in: productIds } } })
        : [];
      const enriched = top.map((t) => {
        const product = products.find((p) => p.id === t.productId);
        return {
          product,
          quantity: t._sum.quantity,
          revenue: (t._sum.price || 0) * (t._sum.quantity || 0),
          orders: t._count.id,
        };
      });
      return res.json({ topProducts: enriched });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },
};
