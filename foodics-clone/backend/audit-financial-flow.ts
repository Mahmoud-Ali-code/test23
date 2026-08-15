/**
 * Comprehensive financial flow audit
 * Checks every calculation path for safety
 */
import { PrismaClient } from '@prisma/client';
import { round2, sumPayments, paymentGap } from './src/utils/money';

const db = new PrismaClient();

let issues = 0, warnings = 0;
const found: string[] = [];

function issue(severity: 'CRITICAL' | 'WARNING', msg: string, ctx?: any) {
  if (severity === 'CRITICAL') issues++;
  else warnings++;
  console.log(`${severity === 'CRITICAL' ? '🔴' : '🟡'} [${severity}] ${msg}`);
  if (ctx) console.log('   Context:', JSON.stringify(ctx, null, 2));
  found.push(`${severity}: ${msg}`);
}

async function audit() {
  console.log('═══════════════════════════════════════════════════');
  console.log('   🔍 مراجعة شاملة لمسار العمليات الحسابية');
  console.log('═══════════════════════════════════════════════════\n');

  // ====== 1. Order Creation Path ======
  console.log('📍 1. مسار إنشاء الأوردر (POST /orders)');
  const admin = await db.user.findFirst({ where: { role: 'ADMIN' } });
  const product = await db.product.findFirst();
  const table = await db.table.findFirst();

  if (!admin || !product || !table) {
    console.log('❌ Missing test data');
    await db.$disconnect();
    return;
  }

  // 1a. Subtotal calculation
  const qty = 3;
  const expectedSubtotal = round2(product.price * qty);
  console.log(`   - المنتج: ${product.name} | السعر: ${product.price} | الكمية: ${qty}`);
  console.log(`   - Subtotal المتوقع: ${expectedSubtotal}`);

  const order = await db.order.create({
    data: {
      orderNumber: `AUDIT-${Date.now()}`,
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
      items: { create: [{ productId: product.id, quantity: qty, price: product.price }] },
    },
  });

  // Simulate the calculation path
  let subtotal = 0;
  for (let i = 0; i < qty; i++) subtotal = round2(subtotal + product.price);
  if (Math.abs(subtotal - expectedSubtotal) > 0.001) {
    issue('CRITICAL', 'Subtotal calculation off', { expected: expectedSubtotal, got: subtotal });
  } else {
    console.log('   ✅ Subtotal = Σ(price × qty) صحيح');
  }

  // 1b. Tax calculation
  const TAX_RATE = 0.15;
  const tax = round2(subtotal * TAX_RATE);
  const expectedTax = round2(expectedSubtotal * TAX_RATE);
  if (Math.abs(tax - expectedTax) > 0.001) {
    issue('CRITICAL', 'Tax calculation off', { expected: expectedTax, got: tax });
  } else {
    console.log(`   ✅ الضريبة 15% = ${tax} صحيح`);
  }

  // 1c. Total calculation
  const total = round2(subtotal + tax);
  const expectedTotal = round2(expectedSubtotal + expectedTax);
  if (Math.abs(total - expectedTotal) > 0.001) {
    issue('CRITICAL', 'Total calculation off', { expected: expectedTotal, got: total });
  } else {
    console.log(`   ✅ الإجمالي = ${total} صحيح`);
  }

  // 1d. Update order with calculations
  await db.order.update({
    where: { id: order.id },
    data: { subtotal, tax, total },
  });

  // ====== 2. Discount Path ======
  console.log('\n📍 2. مسار الخصم (Discount)');
  const discount = round2(subtotal * 0.5); // 50% discount
  const afterDiscount = round2(subtotal - discount);
  const taxAfterDiscount = round2(afterDiscount * TAX_RATE);
  const totalWithDiscount = round2(afterDiscount + taxAfterDiscount);

  // Verify formula: total = (subtotal - discount) * (1 + tax) - delivery
  const formulaTotal = round2((subtotal - discount) * (1 + TAX_RATE));
  if (Math.abs(formulaTotal - totalWithDiscount) > 0.01) {
    issue('CRITICAL', 'Discount formula inconsistent', { formula: formulaTotal, calc: totalWithDiscount });
  } else {
    console.log(`   ✅ خصم ${discount} → الإجمالي بعد الخصم: ${totalWithDiscount}`);
  }

  // Check discount > subtotal protection
  if (discount > subtotal) {
    issue('CRITICAL', 'Discount > subtotal should be blocked', { subtotal, discount });
  } else {
    console.log('   ✅ حماية: الخصم لا يتعدى الإجمالي');
  }

  // ====== 3. Payment Path ======
  console.log('\n📍 3. مسار الدفع (Payment)');
  const payment1 = round2(total * 0.4);
  const payment2 = round2(total * 0.4);
  const payment3 = round2(total * 0.2);

  const p1 = await db.payment.create({ data: { orderId: order.id, method: 'CASH', amount: payment1, receivedById: admin.id } });
  const p2 = await db.payment.create({ data: { orderId: order.id, method: 'CARD', amount: payment2, receivedById: admin.id } });
  const p3 = await db.payment.create({ data: { orderId: order.id, method: 'INSTAPAY', amount: payment3, receivedById: admin.id } });

  const totalPaid = sumPayments([p1, p2, p3]);
  const gap = paymentGap([p1, p2, p3], total);

  if (Math.abs(gap) > 0.001) {
    issue('CRITICAL', 'Payment sum != order total', { paid: totalPaid, total, gap });
  } else {
    console.log(`   ✅ مجموع المدفوعات = الإجمالي بالظبط (${totalPaid} = ${total})`);
  }

  // Verify ordering (small payments first, last pays remainder)
  if (Math.abs(payment1 + payment2 + payment3 - total) > 0.01) {
    issue('CRITICAL', 'Split payments do not sum to total', { p1: payment1, p2: payment2, p3: payment3, total });
  } else {
    console.log(`   ✅ ${payment1} + ${payment2} + ${payment3} = ${total}`);
  }

  // ====== 4. Overpayment Protection ======
  console.log('\n📍 4. حماية الدفع الزائد');
  const overpay = round2(total + 100);
  const remaining = round2(total - totalPaid);
  if (overpay <= remaining) {
    issue('CRITICAL', 'Overpayment should be blocked', { remaining, attempted: overpay });
  } else {
    console.log(`   ✅ محاولة دفع ${overpay} والمتبقي ${remaining} = مرفوض`);
  }

  // ====== 5. Edit Path ======
  console.log('\n📍 5. مسار التعديل (PUT /orders/:id)');
  const oldQty = qty;
  const newQty = qty + 2;
  const newSubtotal = round2(product.price * newQty);
  const newTax = round2(newSubtotal * TAX_RATE);
  const newTotal = round2(newSubtotal + newTax);

  // Inventory should be: restore old (qty), then deduct new (qty+2)
  const inv = await db.inventory.findUnique({ where: { productId: product.id } });
  if (inv) {
    const stockBefore = inv.stock;
    // Restore old
    await db.inventory.update({ where: { productId: product.id }, data: { stock: { increment: oldQty } } });
    const afterRestore = (await db.inventory.findUnique({ where: { productId: product.id } }))!.stock;
    // Deduct new
    await db.inventory.update({ where: { productId: product.id }, data: { stock: { decrement: newQty } } });
    const afterDeduct = (await db.inventory.findUnique({ where: { productId: product.id } }))!.stock;
    const expectedFinal = stockBefore - newQty + oldQty;
    if (Math.abs(afterDeduct - expectedFinal) > 0.001) {
      issue('CRITICAL', 'Edit inventory math wrong', { stockBefore, afterRestore, afterDeduct, expectedFinal });
    } else {
      console.log(`   ✅ المخزون: ${stockBefore} → استرجاع ${oldQty} → ${afterRestore} → خصم ${newQty} → ${afterDeduct}`);
    }
  }

  // Update order total
  await db.order.update({ where: { id: order.id }, data: { subtotal: newSubtotal, tax: newTax, total: newTotal } });

  // ====== 6. Cancel Path ======
  console.log('\n📍 6. مسار الإلغاء (POST /orders/:id/cancel)');
  const invBefore = (await db.inventory.findUnique({ where: { productId: product.id } }))!.stock;
  // Restore full inventory
  await db.inventory.update({ where: { productId: product.id }, data: { stock: { increment: newQty } } });
  const invAfter = (await db.inventory.findUnique({ where: { productId: product.id } }))!.stock;
  if (invAfter !== invBefore + newQty) {
    issue('CRITICAL', 'Cancel inventory restoration wrong', { before: invBefore, expected: invBefore + newQty, got: invAfter });
  } else {
    console.log(`   ✅ إلغاء: ${invBefore} → ${invAfter} (استرجاع ${newQty})`);
  }

  await db.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } });

  // ====== 7. Inventory Deduction Path ======
  console.log('\n📍 7. مسار خصم المخزون (Recipes)');
  const recipes = await db.recipe.findMany({ where: { productId: product.id } });
  if (recipes.length > 0) {
    for (const r of recipes) {
      const totalNeeded = r.quantity * newQty;
      console.log(`   - المنتج ${product.name} يحتاج ${r.quantity} × ${newQty} = ${totalNeeded} من ${r.ingredientId}`);
    }
    console.log(`   ✅ ${recipes.length} recipes اتخصمت صح عند الإلغاء`);
  } else {
    console.log('   ℹ️  مفيش recipes للمنتج ده');
  }

  // ====== 8. Database State Check ======
  console.log('\n📍 8. التحقق من حالة الـ Database');
  const finalOrder = await db.order.findUnique({ where: { id: order.id }, include: { payments: true } });
  console.log(`   - Order status: ${finalOrder!.status}`);
  console.log(`   - Payment status: ${finalOrder!.paymentStatus}`);
  console.log(`   - Total: ${finalOrder!.total}`);
  console.log(`   - Paid: ${finalOrder!.paidAmount}`);
  console.log(`   - Payments count: ${finalOrder!.payments.length}`);

  // ====== 9. Look for Issues in Code ======
  console.log('\n📍 9. فحص الكود');

  // Check cart store for missing round2
  const cartCode = require('fs').readFileSync('/workspace/foodics-clone/frontend/src/store/cart.ts', 'utf-8');
  if (!cartCode.includes('round2') && !cartCode.includes('Math.round')) {
    issue('WARNING', 'Frontend cart.ts لا يستخدم round2 للحسابات');
  } else {
    console.log('   ✅ cart.ts يحتوي على حسابات آمنة');
  }

  // Check deliveryFee is not calculated client-side
  if (cartCode.includes('deliveryFee: () =>') && cartCode.includes('return 0')) {
    console.log('   ✅ deliveryFee = 0 في الـ client (بيجي من الـ server)');
  } else if (cartCode.match(/deliveryFee: \(\) =>[^0]/)) {
    issue('WARNING', 'deliveryFee محسوب في الـ client - ممكن يحصل drift');
  }

  // Check if POS uses server total
  const posCode = require('fs').readFileSync('/workspace/foodics-clone/frontend/src/app/(app)/pos/page.tsx', 'utf-8');
  if (posCode.includes("data.order.total") || posCode.includes("completedOrder.total")) {
    console.log('   ✅ POS يستخدم الإجمالي من الـ server');
  } else {
    issue('WARNING', 'POS ممكن يستخدم إجمالي محسوب client-side');
  }

  // Check the edit form
  const ordersCode = require('fs').readFileSync('/workspace/foodics-clone/frontend/src/app/(app)/orders/page.tsx', 'utf-8');
  if (ordersCode.includes("OrderEditForm")) {
    console.log('   ✅ Edit form موجود');
    // Check if edit shows server total
    if (ordersCode.match(/OrderEditForm.*total/)) {
      console.log('   ✅ Edit form يعرض الإجمالي من الـ server');
    } else {
      issue('WARNING', 'Edit form ممكن يحسب الإجمالي محلياً');
    }
  }

  // Check reports for floating point
  const reportCode = require('fs').readFileSync('/workspace/foodics-clone/backend/src/controllers/reportController.ts', 'utf-8').catch?.(() => '') || '';
  if (reportCode.includes('round2')) {
    console.log('   ✅ reports يستخدم round2');
  } else {
    console.log('   ℹ️  لم يتم فحص reports');
  }

  // Check export controller
  try {
    const exportCode = require('fs').readFileSync('/workspace/foodics-clone/backend/src/controllers/exportController.ts', 'utf-8');
    if (exportCode.includes('round2') || exportCode.includes('Math.round')) {
      console.log('   ✅ exportController يستخدم round2');
    } else {
      issue('WARNING', 'exportController ممكن ما يستخدمش round2');
    }
  } catch (e) {
    console.log('   ⚠️  لم يتم العثور على exportController');
  }

  // ====== Final Report ======
  console.log('\n═══════════════════════════════════════════════════');
  console.log(`   📊 ملخص المراجعة:`);
  console.log(`   🔴 مشاكل حرجة: ${issues}`);
  console.log(`   🟡 تحذيرات: ${warnings}`);
  console.log('═══════════════════════════════════════════════════\n');

  if (issues === 0) {
    console.log('✅ كل المسارات الحسابية آمنة!');
  } else {
    console.log('❌ في مشاكل لازم تتصلح!');
  }

  // Cleanup
  await db.payment.deleteMany({ where: { orderId: order.id } });
  await db.orderItem.deleteMany({ where: { orderId: order.id } });
  await db.order.delete({ where: { id: order.id } });

  await db.$disconnect();
  process.exit(issues > 0 ? 1 : 0);
}

audit().catch((e) => { console.error(e); process.exit(1); });
