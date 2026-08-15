// Reset all transactional data so a fresh tester can start from zero.
// Keeps the menu (Products, Categories, Ingredients, Recipes, Modifiers),
// the org structure (Users, Branches, Tables, DeliveryOptions, Suppliers),
// and the integration setup (Aggregators, Settings).
//
// Backup is at $HOME/.minimax/backups/foodics-db/pre-reset-*.db

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const showCount = async (label, fn) => {
  const n = await fn();
  console.log(`  ${label.padEnd(30, ' ')} ${n} rows deleted`);
};

const baselineStock = {
  // map productId -> stock (only products that track inventory)
  // Default initial values from the original seed
};

(async () => {
  console.log('\n=== Pre-reset counts ===');
  for (const t of ['Order','OrderItem','OrderDeliveryOption','Payment','Refund','Expense','Shift','InventoryMovement','AggregatorWebhookLog','AuditLog','Customer']) {
    const n = await prisma[t[0].toLowerCase() + t.slice(1)].count();
    console.log(`  ${t.padEnd(28, ' ')} ${n}`);
  }

  console.log('\n=== Wiping transactional data (order matters for FKs) ===');
  // Order's child tables first
  await showCount('OrderDeliveryOption', () => prisma.orderDeliveryOption.deleteMany().then(r => r.count));
  await showCount('OrderItem',            () => prisma.orderItem.deleteMany().then(r => r.count));
  await showCount('Payment',              () => prisma.payment.deleteMany().then(r => r.count));
  await showCount('Refund',               () => prisma.refund.deleteMany().then(r => r.count));
  await showCount('Order',                () => prisma.order.deleteMany().then(r => r.count));

  // Inventory / stock
  await showCount('InventoryMovement',    () => prisma.inventoryMovement.deleteMany().then(r => r.count));

  // Cash-flow events
  await showCount('Expense',              () => prisma.expense.deleteMany().then(r => r.count));
  await showCount('Shift',                () => prisma.shift.deleteMany().then(r => r.count));

  // Integration
  await showCount('AggregatorWebhookLog', () => prisma.aggregatorWebhookLog.deleteMany().then(r => r.count));

  // Audit
  await showCount('AuditLog',             () => prisma.auditLog.deleteMany().then(r => r.count));

  // Reset customers to zero balance (keep them so order history links still work;
  // the tester's "أحمد محمد" / "سارة محمود" seeded customers stay, just clean)
  const cust = await prisma.customer.updateMany({
    data: { outstanding: 0, totalSpent: 0, ordersCount: 0, lastOrderAt: null },
  });
  console.log(`  ${'Customer (reset balances)'.padEnd(30, ' ')} ${cust.count} customers reset to 0`);

  // Reset inventory stock to generous defaults so the tester can experiment freely.
  // We bump every tracked product to 100 (instead of wiping the table) so recipes
  // and ingredient links stay intact.
  const inv = await prisma.inventory.updateMany({ data: { stock: 100, minStock: 10 } });
  console.log(`  ${'Inventory (stock=100)'.padEnd(30, ' ')} ${inv.count} products restocked`);
  const ing = await prisma.ingredient.updateMany({ data: { stock: 50, minStock: 5 } });
  console.log(`  ${'Ingredient (stock=50)'.padEnd(30, ' ')} ${ing.count} ingredients restocked`);

  // Reset outOfStockUntil so no product is "hidden"
  await prisma.product.updateMany({ data: { outOfStockUntil: null } });

  console.log('\n=== Post-reset counts ===');
  for (const t of ['Order','OrderItem','OrderDeliveryOption','Payment','Refund','Expense','Shift','InventoryMovement','AggregatorWebhookLog','AuditLog']) {
    const n = await prisma[t[0].toLowerCase() + t.slice(1)].count();
    console.log(`  ${t.padEnd(28, ' ')} ${n}`);
  }
  const c = await prisma.customer.count();
  const p = await prisma.product.count();
  const u = await prisma.user.count();
  console.log(`  ${'Customer (kept)'.padEnd(28, ' ')} ${c}`);
  console.log(`  ${'Product (kept)'.padEnd(28, ' ')} ${p}`);
  console.log(`  ${'User (kept)'.padEnd(28, ' ')} ${u}`);

  console.log('\n✓ Reset complete. Tester starts from a clean slate.');
  await prisma.$disconnect();
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
