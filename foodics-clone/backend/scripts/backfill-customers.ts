/**
 * Backfill: create Customer records for every existing DELIVERY order that has a
 * customerPhone but no customerId, then sync totals.
 *
 * Run once after deploying the P1.3 schema changes:
 *   npx tsx scripts/backfill-customers.ts
 */
import { PrismaClient } from '@prisma/client';
import { findOrCreateCustomer, syncCustomerTotals } from '../src/controllers/customerController';

const db = new PrismaClient();

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  🛠️  Backfilling customers from old orders');
  console.log('═══════════════════════════════════════════════════\n');

  const orders = await db.order.findMany({
    where: { type: 'DELIVERY', customerPhone: { not: null }, customerId: null },
  });
  console.log(`📊 Found ${orders.length} delivery orders without a customer link`);

  let created = 0;
  const phoneToCustomerId = new Map<string, string>();

  for (const o of orders) {
    let customerId = phoneToCustomerId.get(o.customerPhone!);
    if (!customerId) {
      customerId = await findOrCreateCustomer(
        db,
        o.customerName || '',
        o.customerPhone!,
        o.customerAddress,
        o.branchId,
      );
      if (customerId) {
        phoneToCustomerId.set(o.customerPhone!, customerId);
        created++;
      }
    }
    if (customerId) {
      await db.order.update({ where: { id: o.id }, data: { customerId } });
    }
  }

  // Sync totals for all customers
  const allCustomers = await db.customer.findMany();
  for (const c of allCustomers) {
    await syncCustomerTotals(db, c.id);
  }

  // Summary
  const customers = await db.customer.findMany({
    include: { _count: { select: { orders: true } } },
    orderBy: { outstanding: 'desc' },
  });
  console.log(`\n✅ Created ${created} new customers (or linked to existing)`);
  console.log(`📊 Total customers: ${customers.length}`);
  console.log(`💰 Total outstanding: ${customers.reduce((s, c) => s + c.outstanding, 0).toFixed(2)} EGP`);
  console.log('\n─── Top debtors ───');
  for (const c of customers.filter((c) => c.outstanding > 0).slice(0, 10)) {
    console.log(`  ${c.name} (${c.phone}): ${c.outstanding.toFixed(2)} EGP across ${c._count.orders} orders`);
  }

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
