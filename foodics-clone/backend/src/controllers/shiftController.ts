import { Request, Response } from 'express';
import { db } from '../config/prisma';
import { getParam } from '../utils/params';
import { writeAudit, AUDIT } from '../utils/auditLog';
import { comparePassword } from '../utils/jwt';
import PDFDocument from 'pdfkit';
import { round2, computeShiftTotalsPure } from '../utils/finance';

/** Lightweight date formatter so we don't need date-fns */
const fmt = (d: Date | string | null | undefined): string => {
  if (!d) return '-';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '-';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const _round2 = round2;

/**
 * Shift management + X/Z reports + cash reconciliation.
 *
 * A shift represents a cashier's working session:
 *  - OPEN: openingFloat + cash collected from CASH payments + cash refunds in - cash expenses = expected cash in drawer
 *  - CLOSED: cashier enters actualCash (what they counted); the system computes
 *    difference = actualCash - expectedCash (positive = surplus, negative = shortage)
 *
 * X-Report: read-only snapshot of the current open shift's totals (no closure).
 * Z-Report: closes the shift, locks the data, and emits the same totals for archive.
 */
export const shiftController = {
  /**
   * Open a new shift.
   * POST /api/shifts/open
   * body: { openingFloat: number, notes?: string, branchId?: string }
   *
   * Only one shift per (user, OPEN) — if the user has an open shift, we return it.
   */
  async open(req: any, res: Response) {
    try {
      const { openingFloat, notes, branchId } = req.body;
      const float = Number(openingFloat);
      if (!isFinite(float) || float < 0) {
        return res.status(400).json({ error: 'openingFloat يجب أن يكون رقم غير سالب' });
      }
      const userId = req.user.userId;

      // If user already has an open shift, return it instead of creating a duplicate
      const existing = await db.shift.findFirst({ where: { userId, status: 'OPEN' } });
      if (existing) {
        return res.json({ shift: existing, alreadyOpen: true });
      }

      const branch = branchId || req.user.branchId || (await db.branch.findFirst())?.id;
      if (!branch) return res.status(400).json({ error: 'لا يوجد فرع — حدد branchId' });

      const shift = await db.shift.create({
        data: {
          userId,
          branchId: branch,
          openingFloat: round2(float),
          notes: notes || null,
          status: 'OPEN',
        },
        include: { user: { select: { id: true, name: true, role: true } } },
      });
      await writeAudit(db, userId, AUDIT.SHIFT_OPEN, 'Shift', shift.id, { openingFloat: float }, notes);
      return res.status(201).json({ shift });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },

  /** GET /api/shifts/active — the current user's open shift (if any) */
  async active(req: any, res: Response) {
    const shift = await db.shift.findFirst({
      where: { userId: req.user.userId, status: 'OPEN' },
      include: { user: { select: { id: true, name: true, role: true } } },
    });
    return res.json({ shift: shift || null });
  },

  /**
   * GET /api/shifts/:id/x-report
   * Read-only snapshot of an open shift's totals. Used mid-shift to check progress.
   */
  async xReport(req: any, res: Response) {
    try {
      const id = getParam(req.params.id);
      if (!id) return res.status(400).json({ error: 'Invalid id' });
      const shift = await db.shift.findUnique({
        where: { id },
        include: { user: { select: { id: true, name: true, role: true } } },
      });
      if (!shift) return res.status(404).json({ error: 'الشيفت غير موجود' });

      const totals = await computeShiftTotals(shift.id, shift.openedAt, shift.branchId, shift.userId);
      return res.json({ shift, report: { type: 'X', ...totals } });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },

  /**
   * POST /api/shifts/:id/close
   * body: { actualCash: number, notes?: string }
   * Closes the shift, computes the difference, returns the final Z-Report.
   *
   * P1.5: A manager can close another user's open shift by passing `force: true`.
   * The shift's notes get a "FORCED CLOSE BY MANAGER" prefix so it's clear in the audit log.
   */
  async close(req: any, res: Response) {
    try {
      const id = getParam(req.params.id);
      if (!id) return res.status(400).json({ error: 'Invalid id' });
      const { actualCash, notes, force, managerPin } = req.body;
      const actual = Number(actualCash);
      if (!isFinite(actual) || actual < 0) {
        return res.status(400).json({ error: 'actualCash يجب أن يكون رقم غير سالب' });
      }

      const shift = await db.shift.findUnique({ where: { id } });
      if (!shift) return res.status(404).json({ error: 'الشيفت غير موجود' });
      if (shift.status === 'CLOSED') {
        return res.status(400).json({ error: 'الشيفت متقفل بالفعل' });
      }
      // P1.5: force-close authorization. Only managers can force-close someone
      // else's shift; they need to prove they have manager-level access.
      const isOwnShift = shift.userId === req.user.userId;
      if (!isOwnShift && (req.user.role !== 'ADMIN' && req.user.role !== 'MANAGER')) {
        return res.status(403).json({ error: 'يمكنك إغلاق شيفتك فقط' });
      }
      if (!isOwnShift && (req.user.role === 'ADMIN' || req.user.role === 'MANAGER')) {
        if (!force) {
          return res.status(403).json({
            error: 'إغلاق شيفت كاشير آخر يحتاج تأكيد المدير (force=true)',
            requiresForce: true,
          });
        }
        // Optionally validate the manager PIN (if provided) for an extra audit trail
        if (managerPin) {
          const managers = await db.user.findMany({
            where: { id: { not: shift.userId }, role: { in: ['ADMIN', 'MANAGER'] }, isActive: true },
            select: { id: true, password: true },
          });
          let matched = false;
          for (const m of managers) {
            if (await comparePassword(String(managerPin), m.password)) { matched = true; break; }
          }
          if (!matched) return res.status(403).json({ error: 'رمز المدير غير صحيح' });
        }
      }

      const totals = await computeShiftTotals(shift.id, shift.openedAt, shift.branchId, shift.userId);
      const difference = round2(actual - totals.expectedCash);

      const closed = await db.shift.update({
        where: { id },
        data: {
          closingFloat: round2(actual),
          closedAt: new Date(),
          difference,
          notes: notes || shift.notes,
          status: 'CLOSED',
        },
        include: { user: { select: { id: true, name: true, role: true } } },
      });
      // P1.5: log the force-close attribution in the audit so it's traceable
      const auditMetadata: any = {
        openingFloat: shift.openingFloat,
        closingFloat: actual,
        difference,
        ordersCount: totals.ordersCount,
        cashCollected: totals.cashCollected,
        cardCollected: totals.cardCollected,
        force: !isOwnShift,
        forceClosedBy: !isOwnShift ? req.user.userId : null,
      };
      await writeAudit(db, shift.userId, AUDIT.SHIFT_CLOSE, 'Shift', shift.id, auditMetadata, notes);
      return res.json({ shift: closed, report: { type: 'Z', difference, ...totals } });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },

  /** GET /api/shifts — list all shifts (manager+ only) */
  async list(req: any, res: Response) {
    if (req.user.role === 'CASHIER' || req.user.role === 'WAITER' || req.user.role === 'KITCHEN') {
      // Cashiers can only see their own shifts
      const shifts = await db.shift.findMany({
        where: { userId: req.user.userId },
        include: { user: { select: { id: true, name: true, role: true } } },
        orderBy: { openedAt: 'desc' },
        take: 50,
      });
      return res.json({ shifts });
    }
    const shifts = await db.shift.findMany({
      include: { user: { select: { id: true, name: true, role: true } } },
      orderBy: { openedAt: 'desc' },
      take: 100,
    });
    return res.json({ shifts });
  },

  /**
   * F-F: X/Z report as PDF.
   * GET /api/shifts/:id/report.pdf?type=X|Z (default: matches shift.status)
   *
   * Returns a printable PDF for archive/printing. Same totals as the JSON x-report
   * and the close endpoint, just laid out for paper.
   */
  async reportPdf(req: any, res: Response) {
    try {
      const id = getParam(req.params.id);
      if (!id) return res.status(400).json({ error: 'Invalid id' });
      const shift = await db.shift.findUnique({
        where: { id },
        include: { user: { select: { id: true, name: true, role: true } }, branch: true },
      });
      if (!shift) return res.status(404).json({ error: 'الشيفت غير موجود' });

      const totals = await computeShiftTotals(shift.id, shift.openedAt, shift.branchId, shift.userId);
      // type=X always (read-only), type=Z when shift is closed (final). Default = shift.status
      const reportType: 'X' | 'Z' = (req.query.type === 'X' || req.query.type === 'Z')
        ? req.query.type
        : (shift.status === 'CLOSED' ? 'Z' : 'X');

      const filename = `shift-${shift.id.slice(0, 8)}-${reportType}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

      // RTL-safe: we can't use Arabic glyphs in stock PDFKit without a custom font (which
      // we don't ship). So labels stay in English/ASCII. The numbers are universal anyway.
      const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Shift ${reportType} Report` } });
      doc.pipe(res);

      // Header
      doc.fontSize(20).text(`${reportType}-Report`, { align: 'center' });
      doc.fontSize(11).text(`Abu Zoelf POS - ${shift.branch?.nameAr || shift.branch?.name || 'Main Branch'}`, { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(9).fillColor('#666')
        .text(`Cashier: ${shift.user?.name || '-'}`, { align: 'center' })
        .text(`Shift opened: ${fmt(shift.openedAt)}`, { align: 'center' })
        .text(shift.closedAt ? `Shift closed: ${fmt(shift.closedAt)}` : 'Status: OPEN', { align: 'center' });
      doc.fillColor('#000').moveDown(1);

      // Section: Cash breakdown
      const line = (label: string, val: number | string, opts: any = {}) => {
        const v = typeof val === 'number' ? val.toFixed(2) : val;
        doc.fontSize(10).text(label, { continued: true, ...opts });
        doc.text(`  ${v}`, { align: 'left' });
      };

      doc.fontSize(12).text('Cash Reconciliation', { underline: true }).moveDown(0.4);
      line('Opening Float', shift.openingFloat);
      line('Cash Collected', totals.cashCollected);
      line('Cash Refunds (out)', -totals.cashRefunds);
      line('Cash Expenses (out)', -totals.cashExpenses);
      doc.moveDown(0.3);
      doc.fontSize(11).text('Expected Cash in Drawer', { underline: true });
      doc.fontSize(13).text(`${totals.expectedCash.toFixed(2)} EGP`, { align: 'left' });

      if (reportType === 'Z' && shift.status === 'CLOSED') {
        doc.moveDown(0.5);
        line('Actual Cash Counted', shift.closingFloat || 0);
        const diff = (shift.closingFloat || 0) - totals.expectedCash;
        const label = diff >= 0 ? 'SURPLUS' : 'SHORTAGE';
        doc.fontSize(11).fillColor(diff >= 0 ? '#16a34a' : '#dc2626').text(`${label}: ${Math.abs(diff).toFixed(2)} EGP`);
        doc.fillColor('#000');
      }

      // Section: Sales summary
      doc.moveDown(1.2);
      doc.fontSize(12).text('Sales Summary', { underline: true }).moveDown(0.4);
      line('Total Orders Created', totals.ordersCount);
      line('Total Orders Paid', totals.paidOrdersCount);
      line('Cash Sales', totals.cashCollected);
      line('Card Sales', totals.cardCollected);
      line('InstaPay Sales', totals.instapayCollected);
      doc.moveDown(0.3);
      line('Gross Revenue', totals.cashCollected + totals.cardCollected + totals.instapayCollected);
      line('Refunds (all methods)', -(totals.cashRefunds + totals.cardRefunds));
      doc.fontSize(11).text('NET REVENUE', { underline: true });
      doc.fontSize(13).text(`${totals.netRevenue.toFixed(2)} EGP`);

      // Footer
      doc.moveDown(2);
      doc.fontSize(8).fillColor('#888')
        .text(`Generated: ${fmt(new Date())}`, { align: 'center' })
        .text(`Shift ID: ${shift.id}`, { align: 'center' });
      doc.fillColor('#000');

      doc.end();
    } catch (err: any) {
      // PDF stream may have already started; if so, we can't send JSON. End the stream.
      try { res.end(); } catch {}
      console.error('[shift] reportPdf error', err);
    }
  },
};

/**
 * Compute the totals for a shift. The window is from `openedAt` to `now` (or closedAt).
 *
 * Includes:
 *  - cashCollected: sum of Payment rows where method='CASH' in the window
 *  - cardCollected: same for 'CARD'
 *  - instapayCollected: same for 'INSTAPAY'
 *  - refundsByMethod: sum of Refund rows by method
 *  - cashRefunds: refunds issued as CASH
 *  - cashExpenses: sum of Expense rows in the window (assumes paid in CASH for now;
 *      P2.1 will add paymentMethod on Expense and we'll filter properly)
 *  - customerDebtCollected: any payments that paid off PARTIAL/CARRIED debt
 *  - netCash: openingFloat + cashCollected - cashRefunds - cashExpenses
 *  - expectedCash: what the drawer SHOULD have right now (= netCash)
 *  - ordersCount: number of orders created in the window
 *  - paidOrdersCount: number of orders marked PAID in the window
 */
const computeShiftTotals = async (shiftId: string, openedAt: Date, branchId: string, userId: string) => {
  const now = new Date();

  // Payments in window: filter by createdAt + the user who received them
  const payments = await db.payment.findMany({
    where: {
      createdAt: { gte: openedAt, lte: now },
      receivedById: userId,
    },
    select: { method: true, amount: true, refundedAt: true },
  });
  const byMethod: Record<string, number> = { CASH: 0, CARD: 0, INSTAPAY: 0 };
  for (const p of payments) {
    if (p.refundedAt) continue; // skip refunded (the refund is counted separately)
    if (byMethod[p.method] !== undefined) byMethod[p.method] += p.amount;
  }

  // Refunds processed by this user in window
  const refunds = await db.refund.findMany({
    where: { createdAt: { gte: openedAt, lte: now }, processedById: userId },
    select: { method: true, amount: true },
  });
  const refundsByMethod: Record<string, number> = { CASH: 0, CARD: 0, INSTAPAY: 0 };
  for (const r of refunds) {
    if (refundsByMethod[r.method] !== undefined) refundsByMethod[r.method] += r.amount;
  }

  // Cash expenses in window (branch-scoped).
  // B-6: filter by paymentMethod='CASH' — otherwise an INSTAPAY expense (bank transfer
  // to a supplier) would falsely shrink the expected cash in the drawer.
  const expenses = await db.expense.findMany({
    where: { branchId, paymentMethod: 'CASH', date: { gte: openedAt, lte: now } },
    select: { amount: true },
  });
  const cashExpenses = round2(expenses.reduce((s, e) => s + e.amount, 0));

  // Order counts (created in window by this user)
  const ordersCount = await db.order.count({
    where: { createdAt: { gte: openedAt, lte: now }, userId },
  });
  const paidOrdersCount = await db.order.count({
    where: { createdAt: { gte: openedAt, lte: now }, userId, paymentStatus: 'PAID' },
  });

  // Fetch the opening float for the final expected-cash calc
  const shift = await db.shift.findUnique({ where: { id: shiftId } });
  const openingFloat = shift?.openingFloat || 0;

  const cashCollected = byMethod.CASH;
  const cardCollected = byMethod.CARD;
  const instapayCollected = byMethod.INSTAPAY;
  const cashRefunds = refundsByMethod.CASH;
  const cardRefunds = refundsByMethod.CARD;

  // Delegate the rounding + arithmetic to the pure helper so the math is unit-tested
  // and matches the rest of the app.
  const t = computeShiftTotalsPure({
    openingFloat,
    cashCollected,
    cardCollected,
    instapayCollected,
    cashRefunds,
    cardRefunds,
    cashExpenses,
    ordersCount,
    paidOrdersCount,
  });
  return {
    windowStart: openedAt,
    windowEnd: now,
    ...t,
  };
};
