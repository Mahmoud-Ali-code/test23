import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

const auditCounts = await db.auditLog.groupBy({ by: ['action'], _count: { id: true }, orderBy: { _count: { id: 'desc' } } });
console.log('=== Audit log by action (DB) ===');
for (const a of auditCounts) console.log('  ' + a.action + ': ' + a._count.id);
console.log('');

const orders = await db.order.findMany({ select: { orderNumber: true, total: true, paidAmount: true, paymentStatus: true, status: true } });
const drift = orders.filter(o => (o.paymentStatus === 'PAID' && o.paidAmount < o.total) || (o.paymentStatus === 'UNPAID' && o.paidAmount > 0));
console.log('=== Payment status drift ===');
console.log('  Count:', drift.length);

const pays = await db.payment.groupBy({ by: ['method'], _count: { id: true }, _sum: { amount: true } });
console.log('');
console.log('=== Payment method distribution ===');
for (const p of pays) console.log('  ' + p.method + ': ' + p._count.id + ' payments, total=' + Number(p._sum.amount).toFixed(2));

const customers = await db.customer.findMany({ select: { name: true, phone: true, outstanding: true, totalSpent: true, ordersCount: true } });
console.log('');
console.log('=== Customer debt ===');
for (const c of customers) console.log('  ' + c.name + ' (' + c.phone + '): outstanding=' + Number(c.outstanding).toFixed(2) + ', spent=' + Number(c.totalSpent).toFixed(2));

// Today's revenue (UTC + local)
const now = new Date();
const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const tomorrowStart = new Date(todayStart.getTime() + 86400000);
const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
const tomorrowUTC = new Date(todayUTC.getTime() + 86400000);

console.log('');
console.log('=== "Today" timezone bug check ===');
console.log('  Local today:', todayStart.toISOString());
console.log('  UTC today:', todayUTC.toISOString());

const localTodayOrders = await db.order.findMany({ where: { createdAt: { gte: todayStart, lt: tomorrowStart } }, select: { orderNumber: true, createdAt: true, total: true } });
const utcTodayOrders = await db.order.findMany({ where: { createdAt: { gte: todayUTC, lt: tomorrowUTC } }, select: { orderNumber: true, createdAt: true, total: true } });
console.log('  Local-today orders:', localTodayOrders.length);
console.log('  UTC-today orders:', utcTodayOrders.length);
if (localTodayOrders.length && utcTodayOrders.length && localTodayOrders[0].orderNumber !== utcTodayOrders[0].orderNumber) {
  console.log('  ⚠ MISMATCH: local and UTC return different orders');
}

await db.$disconnect();
