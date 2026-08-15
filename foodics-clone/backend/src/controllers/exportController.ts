import { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { db } from '../config/prisma';
import { getParam } from '../utils/params';

const formatSAR = (n: number) => `${(n || 0).toFixed(2)} EGP`;
const round2 = (n: number): number => Math.round(n * 100) / 100;

const buildOrderFilter = (query: any) => {
  const { status, type, startDate, endDate } = query;
  const where: any = {};
  if (status) {
    const statuses = String(status).split(',').map((s) => s.trim()).filter(Boolean);
    where.status = statuses.length > 1 ? { in: statuses } : statuses[0];
  }
  if (type) where.type = type;
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate as string);
    if (endDate) where.createdAt.lte = new Date(endDate as string);
  }
  return where;
};

// ============== EXCEL: ORDERS ==============
export const exportOrdersExcel = async (req: Request, res: Response) => {
  const where = buildOrderFilter(req.query);
  const orders = await db.order.findMany({
    where,
    include: { items: { include: { product: true } }, user: true, table: true, deliveryOptions: { include: { deliveryOption: true } } },
    orderBy: { createdAt: 'desc' },
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Orders', { views: [{ rightToLeft: true }] });

  ws.columns = [
    { header: 'رقم الأوردر', key: 'num', width: 18 },
    { header: 'التاريخ', key: 'date', width: 18 },
    { header: 'النوع', key: 'type', width: 12 },
    { header: 'الطاولة', key: 'table', width: 10 },
    { header: 'الكاشير', key: 'cashier', width: 18 },
    { header: 'العميل', key: 'customer', width: 18 },
    { header: 'الهاتف', key: 'phone', width: 14 },
    { header: 'الحالة', key: 'status', width: 12 },
    { header: 'طريقة الدفع', key: 'pay', width: 12 },
    { header: 'المنتجات', key: 'items', width: 40 },
    { header: 'الإجمالي', key: 'subtotal', width: 12 },
    { header: 'الخصم', key: 'discount', width: 10 },
    { header: 'الضريبة', key: 'tax', width: 10 },
    { header: 'التوصيل', key: 'delivery', width: 10 },
    { header: 'الإجمالي النهائي', key: 'total', width: 14 },
    { header: 'ملاحظات', key: 'notes', width: 30 },
  ];

  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
  ws.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };

  const typeMap: any = { DINE_IN: 'صالة', TAKEAWAY: 'تيك أواي', DELIVERY: 'توصيل' };
  const statusMap: any = { PENDING: 'قيد الانتظار', CONFIRMED: 'مؤكد', PREPARING: 'قيد التحضير', READY: 'جاهز', SERVED: 'تم التقديم', COMPLETED: 'مكتمل', CANCELLED: 'ملغي' };
  const payMap: any = { CASH: 'كاش', CARD: 'بطاقة', WALLET: 'محفظة' };

  for (const o of orders) {
    const itemsStr = o.items.map((i) => {
      const p = i.product;
      const label = p ? (p.nameAr || p.name) : (i.notes || 'صنف');
      return `${label} × ${i.quantity}`;
    }).join(' | ');
    const deliveryStr = o.deliveryOptions.map((d) => `${d.deliveryOption.nameAr} (${formatSAR(d.fee)})`).join(' | ');
    ws.addRow({
      num: o.orderNumber,
      date: new Date(o.createdAt).toLocaleString('ar-EG'),
      type: typeMap[o.type] || o.type,
      table: o.table?.number || '-',
      cashier: o.user.name,
      customer: o.customerName || '-',
      phone: o.customerPhone || '-',
      status: statusMap[o.status] || o.status,
      pay: o.paymentMethod ? (payMap[o.paymentMethod] || o.paymentMethod) : '-',
      items: itemsStr,
      subtotal: o.subtotal,
      discount: o.discount,
      tax: o.tax,
      delivery: o.deliveryFee,
      total: o.total,
      notes: o.notes || '',
    });
  }

  // Totals row
  const lastRow = ws.lastRow?.number || 1;
  const totalRow = ws.addRow({
    num: 'الإجمالي',
    subtotal: orders.reduce((s, o) => s + o.subtotal, 0),
    discount: orders.reduce((s, o) => s + o.discount, 0),
    tax: orders.reduce((s, o) => s + o.tax, 0),
    delivery: orders.reduce((s, o) => s + o.deliveryFee, 0),
    total: orders.reduce((s, o) => s + o.total, 0),
  });
  totalRow.font = { bold: true };
  totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };

  // Number format
  ['subtotal', 'discount', 'tax', 'delivery', 'total'].forEach((k) => {
    ws.getColumn(k).numFmt = '#,##0.00';
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=orders-${Date.now()}.xlsx`);
  await wb.xlsx.write(res);
  res.end();
};

// ============== EXCEL: CASHIER REPORT (خزنه) ==============
// Source of truth for amounts is the Payment table (not order.paymentMethod), because
// split payments have multiple methods and the order column only stores the last one.
// See P0.3 in the financial-flow audit.
export const exportCashierExcel = async (req: Request, res: Response) => {
  const { startDate, endDate, userId } = req.query;
  const orderWhere: any = { paymentStatus: 'PAID' };
  if (userId) orderWhere.userId = userId;
  if (startDate || endDate) {
    orderWhere.completedAt = {};
    if (startDate) orderWhere.completedAt.gte = new Date(startDate as string);
    if (endDate) orderWhere.completedAt.lte = new Date(endDate as string);
  }
  const orders = await db.order.findMany({
    where: orderWhere,
    include: {
      user: true,
      items: { include: { product: true } },
      payments: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: { completedAt: 'desc' },
  });

  // Lookup every Payment for these orders in one go (we need the line-level breakdown
  // for the by-method totals and to render the per-order "method" cell correctly when
  // an order was paid in multiple parts).
  const orderIds = orders.map((o) => o.id);
  const allPayments = orderIds.length
    ? await db.payment.findMany({
        where: { orderId: { in: orderIds } },
        orderBy: { createdAt: 'asc' },
      })
    : [];

  const paymentsByOrder = new Map<string, typeof allPayments>();
  for (const p of allPayments) {
    const arr = paymentsByOrder.get(p.orderId) || [];
    arr.push(p);
    paymentsByOrder.set(p.orderId, arr);
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Cashier Report', { views: [{ rightToLeft: true }] });

  ws.columns = [
    { header: 'رقم الأوردر', key: 'num', width: 18 },
    { header: 'التاريخ', key: 'date', width: 18 },
    { header: 'الكاشير', key: 'cashier', width: 18 },
    { header: 'عدد الأصناف', key: 'itemsCount', width: 12 },
    { header: 'طرق الدفع', key: 'pay', width: 28 },
    { header: 'الإجمالي', key: 'total', width: 14 },
  ];
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } };
  ws.getRow(1).alignment = { horizontal: 'center' };

  const payMap: any = { CASH: 'كاش', CARD: 'بطاقة', INSTAPAY: 'إنستاباي', WALLET: 'محفظة', VODAFONE_CASH: 'فودافون كاش', FAWRY: 'فوري' };
  // Keep this list in sync with VALID_METHODS in orderController.addPayment.
  const byPayment: Record<string, number> = Object.fromEntries(Object.keys(payMap).map((k) => [k, 0]));

  for (const o of orders) {
    const pays = paymentsByOrder.get(o.id) || [];
    const payStr = pays.length
      ? pays.map((p) => `${payMap[p.method] || p.method} (${formatSAR(p.amount)})`).join(' + ')
      : (payMap[o.paymentMethod] || o.paymentMethod || '-');
    ws.addRow({
      num: o.orderNumber,
      date: new Date(o.completedAt || o.createdAt).toLocaleString('ar-EG'),
      cashier: o.user.name,
      itemsCount: o.items.reduce((s, i) => s + i.quantity, 0),
      pay: payStr,
      total: o.total,
    });
    for (const p of pays) {
      if (byPayment[p.method] !== undefined) byPayment[p.method] += p.amount;
    }
  }

  ws.addRow({});
  for (const [method, amount] of Object.entries(byPayment)) {
    if (amount > 0) {
      ws.addRow({ num: `إجمالي ${payMap[method] || method}`, total: amount }).font = { bold: true };
    }
  }
  const grandTotal = ws.addRow({ num: 'الإجمالي الكلي', total: orders.reduce((s, o) => s + o.total, 0) });
  grandTotal.font = { bold: true, size: 14 };
  grandTotal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };

  ws.getColumn('total').numFmt = '#,##0.00';

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=cashier-report-${Date.now()}.xlsx`);
  await wb.xlsx.write(res);
  res.end();
};

// ============== PDF: ORDER RECEIPT ==============
export const exportOrderPDF = async (req: Request, res: Response) => {
  const order = await db.order.findUnique({
    where: { id: getParam(req.params.id) },
    include: { items: { include: { product: true } }, user: true, table: true, branch: true, deliveryOptions: { include: { deliveryOption: true } } },
  });
  if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });

  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=order-${order.orderNumber}.pdf`);
  doc.pipe(res);

  const w = doc.page.width - 80;
  doc.fillColor('#dc2626').fontSize(20).text('أبو الزلف', { align: 'center' });
  doc.moveDown(0.2);
  doc.fillColor('#666').fontSize(10).text('فاتورة طلب', { align: 'center' });
  doc.moveDown(0.6);
  doc.fillColor('#000');

  // Header info
  doc.fontSize(10);
  doc.text(`رقم الطلب: ${order.orderNumber}`, 40);
  doc.text(`التاريخ: ${new Date(order.createdAt).toLocaleString('ar-EG')}`, 40);
  doc.text(`الكاشير: ${order.user.name}`, 40);
  if (order.table) doc.text(`الطاولة: ${order.table.number}`, 40);
  const typeMap: any = { DINE_IN: 'صالة', TAKEAWAY: 'تيك أواي', DELIVERY: 'توصيل' };
  doc.text(`النوع: ${typeMap[order.type] || order.type}`, 40);
  if (order.customerName) doc.text(`العميل: ${order.customerName}`, 40);
  if (order.customerPhone) doc.text(`الهاتف: ${order.customerPhone}`, 40);
  if (order.customerAddress) doc.text(`العنوان: ${order.customerAddress}`, 40);
  doc.moveDown(0.6);

  // Items header
  doc.fillColor('#fff').rect(40, doc.y, w, 20).fill();
  doc.fillColor('#000').fontSize(11).text('المنتج', 50, doc.y - 15);
  doc.text('الكمية', 320, doc.y - 15, { width: 60, align: 'center' });
  doc.text('السعر', 400, doc.y - 15, { width: 70, align: 'center' });
  doc.text('الإجمالي', 490, doc.y - 15, { width: 80, align: 'right' });
  doc.moveDown(0.4);

  // Items
  doc.fillColor('#000').fontSize(10);
  for (const item of order.items) {
    const y = doc.y;
    doc.text(item.product.nameAr || item.product.name, 50, y, { width: 260 });
    doc.text(String(item.quantity), 320, y, { width: 60, align: 'center' });
    doc.text(formatSAR(item.price), 400, y, { width: 70, align: 'center' });
    doc.text(formatSAR(item.price * item.quantity), 490, y, { width: 80, align: 'right' });
    doc.moveDown(0.4);
  }
  doc.moveTo(40, doc.y).lineTo(w + 40, doc.y).stroke();
  doc.moveDown(0.4);

  // Delivery options
  if (order.deliveryOptions.length > 0) {
    for (const d of order.deliveryOptions) {
      doc.text(`+ ${d.deliveryOption.nameAr}`, 50, doc.y, { width: 400 });
      doc.text(formatSAR(d.fee), 490, doc.y - 12, { width: 80, align: 'right' });
      doc.moveDown(0.4);
    }
  }

  // Totals
  const totalsX = 350;
  doc.text('الإجمالي قبل الخصم:', totalsX, doc.y, { width: 150, align: 'right' });
  doc.text(formatSAR(order.subtotal), 490, doc.y - 12, { width: 80, align: 'right' });
  doc.moveDown(0.4);
  if (order.discount > 0) {
    doc.text('الخصم:', totalsX, doc.y, { width: 150, align: 'right' });
    doc.text(`-${formatSAR(order.discount)}`, 490, doc.y - 12, { width: 80, align: 'right' });
    doc.moveDown(0.4);
  }
  doc.text('الضريبة:', totalsX, doc.y, { width: 150, align: 'right' });
  doc.text(formatSAR(order.tax), 490, doc.y - 12, { width: 80, align: 'right' });
  doc.moveDown(0.4);
  if (order.deliveryFee > 0) {
    doc.text('رسوم التوصيل:', totalsX, doc.y, { width: 150, align: 'right' });
    doc.text(formatSAR(order.deliveryFee), 490, doc.y - 12, { width: 80, align: 'right' });
    doc.moveDown(0.4);
  }
  doc.moveDown(0.3);
  doc.fillColor('#dc2626').fontSize(14);
  doc.text('الإجمالي:', totalsX, doc.y, { width: 150, align: 'right' });
  doc.text(formatSAR(order.total), 490, doc.y - 16, { width: 80, align: 'right' });
  doc.fillColor('#000');
  doc.moveDown(0.6);
  if (order.paymentMethod) {
    const payMap: any = { CASH: 'كاش', CARD: 'بطاقة', WALLET: 'محفظة' };
    doc.text(`طريقة الدفع: ${payMap[order.paymentMethod] || order.paymentMethod}`, 40);
  }
  if (order.notes) {
    doc.text(`ملاحظات: ${order.notes}`, 40);
  }

  doc.moveDown(2);
  doc.fillColor('#666').fontSize(9).text('شكراً لزيارتكم - أبو الزلف', { align: 'center' });

  doc.end();
};

// ============== PDF: DAILY REPORT ==============
// Source of truth for per-method amounts is the Payment table (not order.paymentMethod
// which only stores the last method used, losing split-payment detail).
// Date filter is on `completedAt` (when the order was actually paid), not `createdAt`.
// See P1.1 in the financial-flow audit.
const PAY_MAP: Record<string, string> = {
  CASH: 'كاش',
  CARD: 'بطاقة',
  INSTAPAY: 'إنستاباي',
  WALLET: 'محفظة',
  VODAFONE_CASH: 'فودافون كاش',
  FAWRY: 'فوري',
};

export const exportDailyReportPDF = async (req: Request, res: Response) => {
  const { date } = req.query;
  const target = date ? new Date(date as string) : new Date();
  const dayStart = new Date(target.setHours(0, 0, 0, 0));
  const dayEnd = new Date(target.setHours(23, 59, 59, 999));

  // Orders that were COMPLETED (i.e. fully paid) within the day, plus PARTIAL ones
  // created the same day so the user can chase them up. We compute revenue strictly
  // from the sum of `Payment` rows that landed in the day window.
  const [paidOrders, partialOrders, expenses, dayPayments] = await Promise.all([
    db.order.findMany({
      where: { paymentStatus: 'PAID', completedAt: { gte: dayStart, lte: dayEnd } },
      include: { user: true, items: { include: { product: true } } },
      orderBy: { completedAt: 'asc' },
    }),
    db.order.findMany({
      where: { paymentStatus: 'PARTIAL', createdAt: { gte: dayStart, lte: dayEnd } },
      include: { user: true, items: true },
      orderBy: { createdAt: 'asc' },
    }),
    db.expense.findMany({ where: { date: { gte: dayStart, lte: dayEnd } } }),
    db.payment.findMany({
      where: { createdAt: { gte: dayStart, lte: dayEnd } },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  // Sum revenue by payment method directly from the Payment rows.
  const revenueByMethod: Record<string, number> = Object.fromEntries(Object.keys(PAY_MAP).map((k) => [k, 0]));
  for (const p of dayPayments) {
    if (revenueByMethod[p.method] !== undefined) revenueByMethod[p.method] += p.amount;
  }
  const totalCollected = dayPayments.reduce((s, p) => s + p.amount, 0);
  const partialOwed = partialOrders.reduce((s, o) => s + (o.total - o.paidAmount), 0);

  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=daily-report-${dayStart.toISOString().slice(0, 10)}.pdf`);
  doc.pipe(res);

  doc.fillColor('#dc2626').fontSize(22).text('أبو الزلف', { align: 'center' });
  doc.moveDown(0.2);
  doc.fillColor('#666').fontSize(11).text('التقرير اليومي', { align: 'center' });
  doc.moveDown(0.2);
  doc.text(dayStart.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }), { align: 'center' });
  doc.moveDown(0.8);
  doc.fillColor('#000');

  // Summary
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const netCash = totalCollected - totalExpenses;

  doc.fontSize(13).fillColor('#000').text('ملخص اليوم', { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(10);
  doc.text(`طلبات مكتملة: ${paidOrders.length}`, 40);
  doc.text(`طلبات جزئية (آجل): ${partialOrders.length}`, 40);
  doc.text(`إجمالي التحصيل (اللي دخل فعلاً): ${formatSAR(totalCollected)}`, 40);
  doc.text(`متبقي على طلبات جزئية: ${formatSAR(partialOwed)}`, 40);
  doc.text(`إجمالي المصروفات: ${formatSAR(totalExpenses)}`, 40);
  doc.fillColor(netCash >= 0 ? '#10b981' : '#dc2626').fontSize(12);
  doc.text(`صافي النقدية: ${formatSAR(netCash)}`, 40);
  doc.fillColor('#000').fontSize(10);
  doc.moveDown(0.6);

  // By payment
  doc.fontSize(13).text('التحصيل حسب طريقة الدفع', { underline: true });
  doc.moveDown(0.3);
  for (const [m, total] of Object.entries(revenueByMethod)) {
    if (total > 0) {
      doc.text(`${PAY_MAP[m] || m}: ${formatSAR(total)}`, 40);
    }
  }
  doc.moveDown(0.6);

  // Orders list
  if (paidOrders.length > 0) {
    doc.fontSize(13).text('الطلبات المدفوعة', { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(9);
    const typeMap: any = { DINE_IN: 'صالة', TAKEAWAY: 'تيك أواي', DELIVERY: 'توصيل' };
    for (const o of paidOrders) {
      doc.text(`${o.orderNumber} | ${typeMap[o.type] || o.type} | ${o.user.name} | ${formatSAR(o.total)}`, 40);
    }
  }

  if (partialOrders.length > 0) {
    doc.moveDown(0.6);
    doc.fontSize(13).text('طلبات جزئية (مطلوب متابعتها)', { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(9);
    for (const o of partialOrders) {
      doc.text(`${o.orderNumber} | ${o.customerName || '-'} | مدفوع ${formatSAR(o.paidAmount)} / إجمالي ${formatSAR(o.total)} | متبقي ${formatSAR(o.total - o.paidAmount)}`, 40);
    }
  }

  // Expenses
  if (expenses.length > 0) {
    doc.moveDown(0.6);
    doc.fontSize(13).text('المصروفات', { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(9);
    for (const e of expenses) {
      doc.text(`${e.category} - ${e.description} - ${formatSAR(e.amount)}`, 40);
    }
  }

  doc.moveDown(2);
  doc.fillColor('#666').fontSize(9).text('أبو الزلف - نظام إدارة المطعم', { align: 'center' });
  doc.end();
};

/**
 * P1.6: CSV export. Smaller, more flexible than Excel — accountants can pipe
 * it into pivot tables / Power BI / etc.
 *
 * Endpoints:
 *   GET /api/exports/orders.csv?startDate=&endDate=&status=
 *   GET /api/exports/payments.csv?startDate=&endDate=
 *   GET /api/exports/refunds.csv?startDate=&endDate=
 */
const csvEscape = (v: any): string => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
};

const sendCsv = (res: Response, filename: string, headers: string[], rows: any[][]) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  // BOM so Excel reads Arabic as UTF-8 not CP-1252
  res.write('\uFEFF');
  res.write(headers.map(csvEscape).join(',') + '\n');
  for (const row of rows) {
    res.write(row.map(csvEscape).join(',') + '\n');
  }
  res.end();
};

export const exportOrdersCsv = async (req: Request, res: Response) => {
  const where = buildOrderFilter(req.query);
  const orders = await db.order.findMany({
    where,
    include: {
      user: { select: { name: true } },
      table: { select: { number: true } },
      customer: { select: { name: true, phone: true } },
      items: { include: { product: { select: { nameAr: true, name: true } } } },
      payments: { select: { method: true, amount: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });
  const headers = ['رقم الأوردر', 'التاريخ', 'الحالة', 'النوع', 'الكاشير', 'الطاولة', 'العميل', 'هاتف العميل', 'الإجمالي', 'الضريبة', 'الخصم', 'المدفوع', 'المتبقي', 'طريقة الدفع', 'الأصناف'];
  const rows = orders.map((o) => [
    o.orderNumber,
    new Date(o.createdAt).toLocaleString('en-GB'),
    o.status,
    o.type,
    o.user?.name || '',
    o.table?.number || '',
    o.customer?.name || '',
    o.customer?.phone || '',
    Number(o.total).toFixed(2),
    Number(o.tax).toFixed(2),
    Number(o.discount).toFixed(2),
    Number(o.paidAmount).toFixed(2),
    (Number(o.total) - Number(o.paidAmount)).toFixed(2),
    o.paymentMethod || '',
    (o.items || []).map((i: any) => `${i.quantity}x ${i.product?.nameAr || i.product?.name}`).join(' | '),
  ]);
  sendCsv(res, `orders-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
};

export const exportPaymentsCsv = async (req: Request, res: Response) => {
  const { startDate, endDate } = req.query;
  const where: any = {};
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate as string);
    if (endDate) where.createdAt.lte = new Date(endDate as string);
  }
  const payments = await db.payment.findMany({
    where,
    include: {
      order: { select: { orderNumber: true } },
      receivedBy: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });
  const headers = ['التاريخ', 'رقم الأوردر', 'الطريقة', 'المبلغ', 'الكاشير', 'مرجع', 'حالة الاسترداد'];
  const rows = payments.map((p) => [
    new Date(p.createdAt).toLocaleString('en-GB'),
    p.order?.orderNumber || '',
    p.method,
    Number(p.amount).toFixed(2),
    p.receivedBy?.name || '',
    p.reference || '',
    p.refundedAt ? `مسترد (${new Date(p.refundedAt).toLocaleDateString('en-GB')})` : 'فعّال',
  ]);
  sendCsv(res, `payments-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
};

export const exportRefundsCsv = async (req: Request, res: Response) => {
  const { startDate, endDate } = req.query;
  const where: any = {};
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate as string);
    if (endDate) where.createdAt.lte = new Date(endDate as string);
  }
  const refunds = await db.refund.findMany({
    where,
    include: {
      order: { select: { orderNumber: true, total: true } },
      payment: { select: { method: true } },
      processedBy: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });
  const headers = ['التاريخ', 'رقم الأوردر', 'إجمالي الأوردر', 'دفعة', 'المبلغ المسترد', 'طريقة الرد', 'السبب', 'مرجع', 'بواسطة'];
  const rows = refunds.map((r) => [
    new Date(r.createdAt).toLocaleString('en-GB'),
    r.order?.orderNumber || '',
    Number(r.order?.total || 0).toFixed(2),
    r.payment?.method || '',
    Number(r.amount).toFixed(2),
    r.method,
    r.reason || '',
    r.reference || '',
    r.processedBy?.name || '',
  ]);
  sendCsv(res, `refunds-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
};
