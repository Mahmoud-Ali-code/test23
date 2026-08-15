import { Request, Response } from 'express';
import { db } from '../config/prisma';
import { getParam } from '../utils/params';
import { syncCustomerTotals } from './customerController';
import { REFUND_METHODS, isValidRefundMethod } from '../utils/paymentMethods';
import { writeAudit, AUDIT } from '../utils/auditLog';
import { comparePassword } from '../utils/jwt';
import { getSettingNumber, SETTING_KEYS } from './settingsController';

const round2 = (n: number): number => Math.round(n * 100) / 100;
const VALID_REFUND_METHODS = REFUND_METHODS;

export const refundController = {
  /**
   * Issue a refund against a specific payment (and therefore an order).
   * POST /api/orders/:id/refunds
   * body: { paymentId, amount, method, reason, reference? }
   *
   * Rules:
   *  - Order must exist and not be CANCELLED (use cancel for unpaid orders)
   *  - Payment must belong to this order and not be already fully refunded
   *  - Sum of all refunds for the payment cannot exceed payment.amount
   *  - When total refunded on order === paidAmount → mark order.refunded (or leave as PAID with audit trail)
   *  - Adjusts the order's paidAmount (decreases) and re-evaluates paymentStatus
   */
  async create(req: any, res: Response) {
    try {
      const orderId = getParam(req.params.id);
      const { paymentId, amount, method, reason, reference } = req.body;
      if (!orderId) return res.status(400).json({ error: 'Invalid order id' });
      if (!paymentId) return res.status(400).json({ error: 'paymentId مطلوب' });
      const amt = Number(amount);
      if (!isFinite(amt) || amt <= 0) {
        return res.status(400).json({ error: 'قيمة الاسترداد يجب أن تكون أكبر من صفر' });
      }
      if (!method || !isValidRefundMethod(method)) {
        return res.status(400).json({ error: `طريقة ردّ غير صالحة. المسموح: ${VALID_REFUND_METHODS.join(', ')}` });
      }
      if (!reason || !String(reason).trim()) {
        return res.status(400).json({ error: 'سبب الاسترداد مطلوب' });
      }

      // P1.1: Authorization. Cashier can only refund up to the limit. Above the
      // limit requires a manager PIN, supplied in the body's `managerPin`.
      // F-H: limit is now configurable per-tenant via Setting (default 200 EGP).
      const refundLimit = await getSettingNumber(SETTING_KEYS.REFUND_CASHIER_LIMIT, 200);
      const userRole = (req as any).user?.role;
      if ((userRole === 'CASHIER' || userRole === 'WAITER' || userRole === 'KITCHEN') && round2(amt) > refundLimit) {
        const { managerPin } = req.body;
        if (!managerPin) {
          return res.status(403).json({
            error: `الاسترداد أكبر من الحد المسموح (${refundLimit} EGP). يحتاج موافقة مدير.`,
            requiresManager: true,
            limit: refundLimit,
          });
        }
        // Look up any ADMIN or MANAGER user with that password
        const managers = await db.user.findMany({
          where: { role: { in: ['ADMIN', 'MANAGER'] }, isActive: true },
          select: { id: true, password: true, name: true },
        });
        // Verify against hashed passwords (bcrypt)
        let matchedId: string | null = null;
        for (const m of managers) {
          if (await comparePassword(String(managerPin), m.password)) {
            matchedId = m.id;
            break;
          }
        }
        if (!matchedId) {
          return res.status(403).json({ error: 'رمز المدير غير صحيح' });
        }
        // Stash the approver on the request for the audit log
        (req as any).managerApprovedBy = matchedId;
      }

      const order = await db.order.findUnique({ where: { id: orderId } });
      if (!order) return res.status(404).json({ error: 'الأوردر غير موجود' });
      if (order.status === 'CANCELLED') {
        return res.status(400).json({ error: 'لا يمكن عمل استرداد لأوردر ملغي' });
      }

      const payment = await db.payment.findUnique({ where: { id: paymentId } });
      if (!payment || payment.orderId !== orderId) {
        return res.status(404).json({ error: 'الدفعة غير موجودة على هذا الأوردر' });
      }
      if (payment.refundedAt) {
        return res.status(400).json({ error: 'الدفعة مستردة بالفعل' });
      }

      // Sum of all refunds against this payment
      const existingRefunds = await db.refund.aggregate({
        where: { paymentId: payment.id },
        _sum: { amount: true },
      });
      const alreadyRefunded = Number(existingRefunds._sum.amount || 0);
      const remainingForPayment = round2(payment.amount - alreadyRefunded);
      if (round2(amt - remainingForPayment) > 0.001) {
        return res.status(400).json({
          error: `قيمة الاسترداد تتجاوز المتبقي من الدفعة`,
          remaining: remainingForPayment,
          attempted: round2(amt),
        });
      }

      const result = await db.$transaction(async (tx) => {
        const refund = await tx.refund.create({
          data: {
            paymentId: payment.id,
            orderId: order.id,
            amount: round2(amt),
            method,
            reason: String(reason).trim(),
            reference: reference || null,
            processedById: req.user.userId,
          },
        });

        const totalRefundedForPayment = round2(alreadyRefunded + amt);
        if (round2(totalRefundedForPayment - payment.amount) >= 0) {
          await tx.payment.update({
            where: { id: payment.id },
            data: { refundedAt: new Date(), refundReason: String(reason).trim() },
          });
        }

        // Sum all refunds on the order
        const orderRefunds = await tx.refund.aggregate({
          where: { orderId: order.id },
          _sum: { amount: true },
        });
        const totalOrderRefunded = Number(orderRefunds._sum.amount || 0);
        const newPaidAmount = round2(Math.max(0, order.paidAmount - amt));
        const newStatus =
          newPaidAmount <= 0 ? 'UNPAID' : newPaidAmount < order.total ? 'PARTIAL' : 'PAID';

        const updated = await tx.order.update({
          where: { id: order.id },
          data: {
            paidAmount: newPaidAmount,
            paymentStatus: newStatus,
            // If we fully refunded, walk the status back from COMPLETED → SERVED
            // (the order is still in the books but the cashier should re-validate it)
            status: order.status === 'COMPLETED' && newStatus === 'UNPAID' ? 'SERVED' : order.status,
          },
          include: { customer: { select: { id: true } } },
        });

        // P1.3: re-sync customer outstanding after refund
        if (updated.customer?.id) {
          await syncCustomerTotals(tx, updated.customer.id);
        }

        // P2.3: audit log
        await writeAudit(tx, req.user.userId, AUDIT.REFUND_CREATE, 'Refund', refund.id, {
          orderId: order.id,
          orderNumber: order.orderNumber,
          paymentId: payment.id,
          amount: round2(amt),
          method,
          managerApprovedBy: (req as any).managerApprovedBy || null,
        }, reason);

        return { refund, order: updated, totalRefundedForPayment, totalOrderRefunded };
      });

      return res.json({
        refund: result.refund,
        order: result.order,
        summary: {
          paymentRefunded: result.totalRefundedForPayment,
          paymentTotal: payment.amount,
          orderRefunded: result.totalOrderRefunded,
          orderTotal: order.total,
        },
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },

  /** GET /api/orders/:id/refunds — list refunds for an order */
  async listForOrder(req: Request, res: Response) {
    const orderId = getParam(req.params.id);
    if (!orderId) return res.status(400).json({ error: 'Invalid order id' });
    const refunds = await db.refund.findMany({
      where: { orderId },
      include: {
        payment: { select: { id: true, method: true, amount: true, createdAt: true } },
        processedBy: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const total = round2(refunds.reduce((s, r) => s + r.amount, 0));
    return res.json({ refunds, total, count: refunds.length });
  },

  /** GET /api/refunds?startDate=&endDate=&userId= — list across orders (for reports) */
  async list(req: Request, res: Response) {
    const { startDate, endDate, userId } = req.query;
    const where: any = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) where.createdAt.lte = new Date(endDate as string);
    }
    if (userId) where.processedById = userId;
    const refunds = await db.refund.findMany({
      where,
      include: {
        payment: { select: { method: true, amount: true } },
        order: { select: { id: true, orderNumber: true, total: true } },
        processedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const total = round2(refunds.reduce((s, r) => s + r.amount, 0));
    const byMethod: Record<string, number> = Object.fromEntries(VALID_REFUND_METHODS.map((m) => [m, 0]));
    for (const r of refunds) {
      if (byMethod[r.method] !== undefined) byMethod[r.method] += r.amount;
    }
    return res.json({ refunds, total, count: refunds.length, byMethod });
  },

  /**
   * DELETE /api/refunds/:id
   * Manager+ only. Reverses a refund (pays the customer back) — used for corrections
   * when a refund was issued by mistake.
   */
  async remove(req: any, res: Response) {
    if (req.user.role === 'CASHIER' || req.user.role === 'WAITER' || req.user.role === 'KITCHEN') {
      return res.status(403).json({ error: 'غير مسموح لك بالعكس — مدير فقط' });
    }
    const id = getParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const refund = await db.refund.findUnique({ where: { id } });
    if (!refund) return res.status(404).json({ error: 'الاسترداد غير موجود' });

    const result = await db.$transaction(async (tx) => {
      await tx.refund.delete({ where: { id } });
      // Clear refundedAt on the payment if no remaining refunds cover it fully
      const remaining = await tx.refund.aggregate({
        where: { paymentId: refund.paymentId },
        _sum: { amount: true },
      });
      const stillFullRefund = Number(remaining._sum.amount || 0) >= refund.payment.amount
        ? false
        : true; // still some amount unrefunded, clear marker
      if (stillFullRefund) {
        await tx.payment.update({
          where: { id: refund.paymentId },
          data: { refundedAt: null, refundReason: null },
        });
      }
      // Restore order paidAmount
      const order = await tx.order.findUnique({
        where: { id: refund.orderId },
        include: { customer: { select: { id: true } } },
      });
      if (order) {
        const newPaid = round2(order.paidAmount + refund.amount);
        const newStatus = newPaid <= 0 ? 'UNPAID' : newPaid < order.total ? 'PARTIAL' : 'PAID';
        await tx.order.update({
          where: { id: order.id },
          data: { paidAmount: newPaid, paymentStatus: newStatus },
        });
        // P1.3: re-sync customer
        if (order.customer?.id) await syncCustomerTotals(tx, order.customer.id);
      }
      // P2.3: audit log for the reversal
      await writeAudit(tx, req.user.userId, AUDIT.REFUND_REMOVE, 'Refund', id, {
        orderId: refund.orderId,
        amount: refund.amount,
      });
      return { orderId: refund.orderId };
    });
    return res.json({ message: 'تم عكس الاسترداد', ...result });
  },
};
