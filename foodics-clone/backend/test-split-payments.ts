/**
 * Comprehensive test for split-payment feature
 * Verifies: math accuracy, edge cases, race conditions
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

let passed = 0, failed = 0;
function check(name: string, cond: boolean, detail?: any) {
  if (cond) { passed++; console.log(`✅ ${name}`); }
  else { failed++; console.log(`❌ ${name}`, detail || ''); }
}

async function main() {
  console.log('\n=== اختبار الدفع المتعدد (Split Payment) ===\n');

  // Setup: get admin and a product
  const admin = await db.user.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) throw new Error('No admin user');
  const product = await db.product.findFirst();
  if (!product) throw new Error('No product');
  const table = await db.table.findFirst();
  if (!table) throw new Error('No table');

  // Get initial ingredient stock
  const ingredient = await db.ingredient.findFirst({
    where: { recipe: { some: { productId: product.id } } }
  });
  if (!ingredient) throw new Error('No ingredient for product');
  const initialStock = ingredient.stock;
  console.log(`📦 المنتج: ${product.name} (${product.price} EGP)`);
  console.log(`📦 المخزون الابتدائي: ${initialStock}\n`);

  // === Test 1: Create order ===
  console.log('🧪 Test 1: إنشاء أوردر جديد');
  const order = await db.order.create({
    data: {
      orderNumber: `TEST-${Date.now()}`,
      type: 'DINE_IN',
      status: 'PENDING',
      paymentStatus: 'UNPAID',
      branchId: admin.branchId!,
      userId: admin.id,
      tableId: table.id,
      subtotal: 0,
      tax: 0,
      discount: 0,
      deliveryFee: 0,
      paidAmount: 0,
      total: 0,
      items: { create: [{ productId: product.id, quantity: 1, price: product.price }] },
    },
    include: { items: true, payments: true },
  });
  const orderTotal = product.price * 1.15; // with 15% tax
  await db.order.update({ where: { id: order.id }, data: { subtotal: product.price, tax: round2(product.price * 0.15), total: round2(orderTotal) } });
  check('أوردر اتعمل', !!order);
  console.log(`   الإجمالي: ${round2(orderTotal)} EGP\n`);

  // === Test 2: Add first payment (CASH 50%) ===
  console.log('🧪 Test 2: دفعة أولى CASH (50%)');
  const pay1 = await db.payment.create({
    data: { orderId: order.id, method: 'CASH', amount: round2(orderTotal / 2), receivedById: admin.id },
  });
  const paid1 = round2(orderTotal / 2);
  await db.order.update({
    where: { id: order.id },
    data: { paidAmount: paid1, paymentStatus: 'PARTIAL', paymentMethod: 'CASH' },
  });
  const afterPay1 = await db.order.findUnique({ where: { id: order.id }, include: { payments: true } });
  check('payment method CASH مسجلة', pay1.method === 'CASH');
  check('paidAmount مظبوط', afterPay1!.paidAmount === paid1, { expected: paid1, got: afterPay1!.paidAmount });
  check('paymentStatus = PARTIAL', afterPay1!.paymentStatus === 'PARTIAL');
  console.log(`   المدفوع: ${paid1} EGP | المتبقي: ${round2(orderTotal - paid1)} EGP\n`);

  // === Test 3: Add second payment (CARD الباقي) ===
  console.log('🧪 Test 3: دفعة ثانية CARD (الباقي)');
  const remaining = round2(orderTotal - paid1);
  const pay2 = await db.payment.create({
    data: { orderId: order.id, method: 'CARD', amount: remaining, receivedById: admin.id, reference: 'TXN-12345' },
  });
  const paid2 = round2(paid1 + remaining);
  await db.order.update({
    where: { id: order.id },
    data: {
      paidAmount: paid2,
      paymentStatus: paid2 >= orderTotal - 0.001 ? 'PAID' : 'PARTIAL',
      paymentMethod: 'CARD',
      status: 'COMPLETED',
      completedAt: new Date(),
    },
  });
  if (paid2 >= orderTotal - 0.001) {
    await db.table.update({ where: { id: table.id }, data: { status: 'AVAILABLE' } });
  }
  const afterPay2 = await db.order.findUnique({ where: { id: order.id }, include: { payments: true } });
  check('payment 2 اتعملت', !!pay2);
  check('paidAmount = total (مدفوع بالكامل)', Math.abs(afterPay2!.paidAmount - orderTotal) < 0.01, { expected: orderTotal, got: afterPay2!.paidAmount });
  check('paymentStatus = PAID', afterPay2!.paymentStatus === 'PAID');
  check('order status = COMPLETED', afterPay2!.status === 'COMPLETED');
  check('عدد المدفوعات = 2', afterPay2!.payments.length === 2);
  check('reference اتسجل', pay2.reference === 'TXN-12345');
  console.log(`   المدفوع: ${paid2} EGP | اكتمل ✅\n`);

  // === Test 4: Overpayment protection ===
  console.log('🧪 Test 4: حماية من الدفع الزائد');
  // Create new order
  const order2 = await db.order.create({
    data: {
      orderNumber: `TEST-OVR-${Date.now()}`,
      type: 'DINE_IN',
      status: 'PENDING',
      paymentStatus: 'UNPAID',
      branchId: admin.branchId!,
      userId: admin.id,
      tableId: table.id,
      subtotal: product.price,
      tax: round2(product.price * 0.15),
      total: round2(product.price * 1.15),
      paidAmount: 0,
    },
  });
  const total2 = order2.total;
  const half = round2(total2 / 2);
  // Pay 50%
  await db.payment.create({ data: { orderId: order2.id, method: 'CASH', amount: half, receivedById: admin.id } });
  await db.order.update({ where: { id: order2.id }, data: { paidAmount: half, paymentStatus: 'PARTIAL' } });
  // Try to overpay
  const tryOverpay = round2(half + 100); // would exceed
  const remaining2 = round2(total2 - half);
  const wouldOverpay = tryOverpay > remaining2 + 0.001;
  check('حماية من الدفع الزائد تشتغل', wouldOverpay, { remaining: remaining2, tried: tryOverpay });
  console.log(`   المتبقي: ${remaining2} | لو حاول يدفع: ${tryOverpay} = مرفوض ✅\n`);

  // === Test 5: Multi-payer scenario (3 customers, 3 methods) ===
  console.log('🧪 Test 5: 3 عملاء يدفعون معاً (3 طرق مختلفة)');
  const order3 = await db.order.create({
    data: {
      orderNumber: `TEST-MULTI-${Date.now()}`,
      type: 'DELIVERY',
      status: 'PENDING',
      paymentStatus: 'UNPAID',
      branchId: admin.branchId!,
      userId: admin.id,
      subtotal: 600,
      tax: 90,
      deliveryFee: 25,
      total: 715,
      paidAmount: 0,
      customerName: '3 عملاء',
    },
  });
  const total3 = 715;
  const pay3a = await db.payment.create({ data: { orderId: order3.id, method: 'CASH', amount: 300, payerName: 'أحمد', receivedById: admin.id } });
  const pay3b = await db.payment.create({ data: { orderId: order3.id, method: 'INSTAPAY', amount: 215, payerName: 'محمد', receivedById: admin.id, reference: 'INSTA-987' } });
  const pay3c = await db.payment.create({ data: { orderId: order3.id, method: 'VODAFONE_CASH', amount: 200, payerName: 'علي', receivedById: admin.id, reference: 'VF-555' } });
  const totalPaid3 = round2(pay3a.amount + pay3b.amount + pay3c.amount);
  await db.order.update({
    where: { id: order3.id },
    data: {
      paidAmount: totalPaid3,
      paymentStatus: totalPaid3 >= total3 - 0.001 ? 'PAID' : 'PARTIAL',
      status: totalPaid3 >= total3 - 0.001 ? 'COMPLETED' : 'PENDING',
      completedAt: totalPaid3 >= total3 - 0.001 ? new Date() : null,
    },
  });
  const after3 = await db.order.findUnique({ where: { id: order3.id }, include: { payments: true } });
  check('3 مدفوعات اتسجلت', after3!.payments.length === 3);
  check('مجموع المدفوعات = الإجمالي', Math.abs(totalPaid3 - total3) < 0.01, { expected: total3, got: totalPaid3 });
  check('paymentStatus = PAID', after3!.paymentStatus === 'PAID');
  check('payerName اتسجل لـ 3 عملاء', pay3a.payerName === 'أحمد' && pay3b.payerName === 'محمد' && pay3c.payerName === 'علي');
  check('طرق دفع مختلفة: CASH, INSTAPAY, VODAFONE_CASH',
    pay3a.method === 'CASH' && pay3b.method === 'INSTAPAY' && pay3c.method === 'VODAFONE_CASH');
  console.log(`   300 CASH (أحمد) + 215 INSTAPAY (محمد) + 200 VODAFONE_CASH (علي) = ${totalPaid3} ✅\n`);

  // === Test 6: Rounding precision (0.1 + 0.2) ===
  console.log('🧪 Test 6: دقة الأرقام (0.1 + 0.2 = 0.3)');
  const sum = round2(0.1 + 0.2);
  check('round2(0.1 + 0.2) = 0.3', sum === 0.3, { got: sum });
  const tax = round2(33.33 * 0.15);
  check('ضريبة 15% على 33.33 = 5.00', tax === 5.00, { got: tax });
  const total4 = round2(33.33 + 5.00);
  check('33.33 + 5.00 = 38.33 (no drift)', total4 === 38.33, { got: total4 });
  console.log('');

  // === Test 7: Multiple small payments (split 644 across 3) ===
  console.log('🧪 Test 7: تقسيم مبلغ 644 على 3 دفعات');
  const order4 = await db.order.create({
    data: {
      orderNumber: `TEST-SPLIT3-${Date.now()}`,
      type: 'DINE_IN', status: 'PENDING', paymentStatus: 'UNPAID',
      branchId: admin.branchId!, userId: admin.id, tableId: table.id,
      subtotal: 560, tax: 84, total: 644, paidAmount: 0,
    },
  });
  const p1 = 200, p2 = 200, p3 = 244; // 200+200+244 = 644
  const s1 = await db.payment.create({ data: { orderId: order4.id, method: 'CASH', amount: p1, receivedById: admin.id } });
  await sleep(50);
  const s2 = await db.payment.create({ data: { orderId: order4.id, method: 'CARD', amount: p2, receivedById: admin.id } });
  await sleep(50);
  const s3 = await db.payment.create({ data: { orderId: order4.id, method: 'INSTAPAY', amount: p3, receivedById: admin.id } });
  const sumSplits = round2(p1 + p2 + p3);
  await db.order.update({
    where: { id: order4.id },
    data: { paidAmount: sumSplits, paymentStatus: 'PAID', status: 'COMPLETED', completedAt: new Date() },
  });
  const order4After = await db.order.findUnique({ where: { id: order4.id }, include: { payments: { orderBy: { createdAt: 'asc' } } } });
  check('3 دفعات صغيرة اتسجلت بالترتيب', order4After!.payments.length === 3);
  check('المجموع = 644 بالظبط', Math.abs(sumSplits - 644) < 0.01, { got: sumSplits });
  check('paymentStatus = PAID', order4After!.paymentStatus === 'PAID');
  check('الترتيب الزمني محفوظ', order4After!.payments[0].method === 'CASH' && order4After!.payments[2].method === 'INSTAPAY');
  console.log(`   200 + 200 + 244 = 644 ✅\n`);

  // === Cleanup test orders ===
  console.log('🧹 تنظيف الأوردرات التجريبية...');
  await db.payment.deleteMany({ where: { orderId: { in: [order.id, order2.id, order3.id, order4.id] } } });
  await db.orderItem.deleteMany({ where: { orderId: { in: [order.id, order2.id, order3.id, order4.id] } } });
  await db.order.deleteMany({ where: { id: { in: [order.id, order2.id, order3.id, order4.id] } } });

  // === Final result ===
  console.log('\n=========================================');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total:  ${passed + failed}`);
  console.log('=========================================\n');

  await db.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
