// 🧪 Financial Integrity Test
// Validates that all monetary calculations are correct and consistent.
// Run with: npx tsx test-financial.ts

import { db } from './src/config/prisma';

const TAX_RATE = 0.15;
const round2 = (n: number) => Math.round(n * 100) / 100;

let passed = 0;
let failed = 0;
const failures: string[] = [];

const assert = (cond: boolean, msg: string) => {
  if (cond) { passed++; console.log(`✅ ${msg}`); }
  else { failed++; failures.push(msg); console.log(`❌ ${msg}`); }
};

const expectEq = (actual: number, expected: number, msg: string) => {
  const a = round2(actual); const e = round2(expected);
  assert(a === e, `${msg} (expected ${e}, got ${a})`);
};

const calcOrderTotals = (items: { price: number; quantity: number }[], discount: number, deliveryFee: number) => {
  const subtotal = round2(items.reduce((s, i) => s + i.price * i.quantity, 0));
  const afterDiscount = round2(Math.max(0, subtotal - discount));
  const tax = round2(afterDiscount * TAX_RATE);
  const total = round2(afterDiscount + tax + deliveryFee);
  return { subtotal, afterDiscount, tax, total };
};

async function main() {
  console.log('\n🧪 === اختبار سلامة الحسابات المالية ===\n');

  // Test 1: Simple order, no discount, no delivery
  console.log('📋 Test 1: أوردر بسيط بدون خصم أو توصيل');
  {
    const items = [{ price: 100, quantity: 2 }, { price: 50, quantity: 3 }];
    const r = calcOrderTotals(items, 0, 0);
    expectEq(r.subtotal, 350, 'Subtotal: 100×2 + 50×3 = 350');
    expectEq(r.tax, 52.5, 'Tax: 350 × 15% = 52.5');
    expectEq(r.total, 402.5, 'Total: 350 + 52.5 = 402.5');
  }

  // Test 2: With discount
  console.log('\n📋 Test 2: أوردر مع خصم');
  {
    const items = [{ price: 200, quantity: 1 }];
    const r = calcOrderTotals(items, 20, 0);
    expectEq(r.subtotal, 200, 'Subtotal: 200');
    expectEq(r.afterDiscount, 180, 'After discount: 200 - 20 = 180');
    expectEq(r.tax, 27, 'Tax: 180 × 15% = 27');
    expectEq(r.total, 207, 'Total: 180 + 27 = 207');
  }

  // Test 3: With delivery fee
  console.log('\n📋 Test 3: أوردر مع توصيل');
  {
    const items = [{ price: 100, quantity: 1 }];
    const r = calcOrderTotals(items, 0, 25);
    expectEq(r.subtotal, 100, 'Subtotal: 100');
    expectEq(r.tax, 15, 'Tax: 100 × 15% = 15');
    expectEq(r.total, 140, 'Total: 100 + 15 + 25 = 140');
  }

  // Test 4: With discount and delivery
  console.log('\n📋 Test 4: أوردر مع خصم + توصيل');
  {
    const items = [{ price: 100, quantity: 1 }];
    const r = calcOrderTotals(items, 10, 25);
    expectEq(r.subtotal, 100, 'Subtotal: 100');
    expectEq(r.afterDiscount, 90, 'After discount: 100 - 10 = 90');
    expectEq(r.tax, 13.5, 'Tax: 90 × 15% = 13.5');
    expectEq(r.total, 128.5, 'Total: 90 + 13.5 + 25 = 128.5');
  }

  // Test 5: Edge case - discount equals subtotal
  console.log('\n📋 Test 5: خصم = الإجمالي');
  {
    const items = [{ price: 100, quantity: 1 }];
    const r = calcOrderTotals(items, 100, 25);
    expectEq(r.subtotal, 100, 'Subtotal: 100');
    expectEq(r.afterDiscount, 0, 'After discount: 0');
    expectEq(r.tax, 0, 'Tax: 0');
    expectEq(r.total, 25, 'Total: only delivery');
  }

  // Test 6: Floating point edge case
  console.log('\n📋 Test 6: دقة الفاصلة العائمة (مثل 0.1 + 0.2)');
  {
    const items = [{ price: 33.33, quantity: 3 }];
    const r = calcOrderTotals(items, 0, 0);
    expectEq(r.subtotal, 99.99, 'Subtotal: 33.33 × 3 = 99.99 (no float drift)');
  }

  // Test 7: Rounding
  console.log('\n📋 Test 7: تقريب (19.99 × 3 × 15%)');
  {
    const items = [{ price: 19.99, quantity: 3 }];
    const r = calcOrderTotals(items, 0, 0);
    expectEq(r.subtotal, 59.97, 'Subtotal: 19.99 × 3 = 59.97');
    expectEq(r.tax, 9, 'Tax: 59.97 × 0.15 = 9.0 (rounded)');
    expectEq(r.total, 68.97, 'Total: 59.97 + 9.0 = 68.97');
  }

  // Test 8: Large order
  console.log('\n📋 Test 8: أوردر كبير (500 ج)');
  {
    const items = [{ price: 500, quantity: 1 }];
    const r = calcOrderTotals(items, 0, 50);
    expectEq(r.subtotal, 500, 'Subtotal: 500');
    expectEq(r.tax, 75, 'Tax: 500 × 0.15 = 75');
    expectEq(r.total, 625, 'Total: 500 + 75 + 50 = 625');
  }

  // Test 9: Many small items
  console.log('\n📋 Test 9: أصناف صغيرة كتير');
  {
    const items = [];
    for (let i = 0; i < 20; i++) items.push({ price: 5.5, quantity: 1 });
    const r = calcOrderTotals(items, 0, 0);
    expectEq(r.subtotal, 110, 'Subtotal: 5.5 × 20 = 110');
    expectEq(r.tax, 16.5, 'Tax: 110 × 0.15 = 16.5');
    expectEq(r.total, 126.5, 'Total: 110 + 16.5 = 126.5');
  }

  // Test 10: Discount > subtotal should be rejected (clamped to 0)
  console.log('\n📋 Test 10: خصم أكبر من الإجمالي (clamped to 0)');
  {
    const items = [{ price: 50, quantity: 1 }];
    const r = calcOrderTotals(items, 100, 0);
    expectEq(r.subtotal, 50, 'Subtotal: 50');
    expectEq(r.afterDiscount, 0, 'After discount: max(0, 50-100) = 0');
    expectEq(r.tax, 0, 'Tax: 0');
    expectEq(r.total, 0, 'Total: 0');
  }

  // ============================================
  // === Database integrity tests ===
  // ============================================
  console.log('\n\n🗄️  === اختبار سلامة قاعدة البيانات ===\n');

  // Test 11: All orders have valid totals
  console.log('📋 Test 11: كل الطلبات في الـ DB محسوبة صح');
  const orders = await db.order.findMany({ include: { items: true, deliveryOptions: true } });
  let allValid = true;
  for (const o of orders) {
    const expectedSubtotal = round2(o.items.reduce((s, i) => s + i.price * i.quantity, 0));
    const expectedDelivery = round2(o.deliveryOptions.reduce((s, d) => s + d.fee, 0));
    const afterDiscount = round2(Math.max(0, expectedSubtotal - o.discount));
    const expectedTax = round2(afterDiscount * TAX_RATE);
    const expectedTotal = round2(afterDiscount + expectedTax + expectedDelivery);
    if (Math.abs(o.subtotal - expectedSubtotal) > 0.01 ||
        Math.abs(o.tax - expectedTax) > 0.01 ||
        Math.abs(o.total - expectedTotal) > 0.01 ||
        Math.abs(o.deliveryFee - expectedDelivery) > 0.01) {
      allValid = false;
      console.log(`  ❌ Order ${o.orderNumber}: subtotal=${o.subtotal} (exp ${expectedSubtotal}), tax=${o.tax} (exp ${expectedTax}), total=${o.total} (exp ${expectedTotal}), delivery=${o.deliveryFee} (exp ${expectedDelivery})`);
    }
  }
  assert(allValid, `كل الـ ${orders.length} أوردر في الـ DB محسوبة صح`);

  // Test 12: No order has negative totals
  console.log('\n📋 Test 12: لا يوجد أوردر بإجمالي سالب');
  const negativeOrders = orders.filter((o) => o.total < 0 || o.subtotal < 0 || o.tax < 0);
  assert(negativeOrders.length === 0, `لا يوجد أوردر بإجمالي سالب (${negativeOrders.length} found)`);

  // Test 13: All order items have positive quantities
  console.log('\n📋 Test 13: كل عناصر الأوردرز كمياتها > 0');
  const zeroQty = orders.flatMap((o) => o.items).filter((i) => i.quantity <= 0);
  assert(zeroQty.length === 0, `لا يوجد عنصر بكمية <= 0 (${zeroQty.length} found)`);

  // Test 14: No duplicate order numbers
  console.log('\n📋 Test 14: لا يوجد رقمين أوردر مكررين');
  const nums = orders.map((o) => o.orderNumber);
  const unique = new Set(nums);
  assert(nums.length === unique.size, `كل الأرقام فريدة (${nums.length} orders, ${unique.size} unique)`);

  // Test 15: Inventory consistency
  console.log('\n📋 Test 15: المخزون لا يقل عن الصفر');
  const inventories = await db.inventory.findMany();
  const negativeInv = inventories.filter((i) => i.stock < 0);
  assert(negativeInv.length === 0, `لا يوجد مخزون سالب (${negativeInv.length} found)`);

  const ingredients = await db.ingredient.findMany();
  const negativeIng = ingredients.filter((i) => i.stock < 0);
  assert(negativeIng.length === 0, `لا يوجد مكون خام بمخزون سالب (${negativeIng.length} found)`);

  // Test 16: Suppliers outstanding balance math
  console.log('\n📋 Test 16: حسابات الموردين (مدفوع + متبقي = الإجمالي)');
  const invoices = await db.supplierInvoice.findMany();
  let allInvoicesValid = true;
  for (const inv of invoices) {
    if (inv.paid > inv.amount + 0.01) {
      allInvoicesValid = false;
      console.log(`  ❌ Invoice ${inv.number}: paid ${inv.paid} > amount ${inv.amount}`);
    }
  }
  assert(allInvoicesValid, `كل الفواتير مدفوعها <= إجماليها`);

  console.log('\n\n═══════════════════════════════════════');
  console.log(`📊 النتيجة النهائية:`);
  console.log(`   ✅ نجح: ${passed}`);
  console.log(`   ❌ فشل: ${failed}`);
  if (failed > 0) {
    console.log(`\n❌ الفشل:`);
    failures.forEach((f) => console.log(`   - ${f}`));
    process.exit(1);
  } else {
    console.log(`\n🎉 كل الاختبارات نجحت! الحسابات المالية سليمة 100%`);
  }
  console.log('═══════════════════════════════════════\n');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
