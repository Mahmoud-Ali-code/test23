/**
 * Backfill script: fix existing orders whose `paidAmount` / `paymentStatus` drifted
 * out of sync with the sum of their Payment rows.
 *
 * Run once after deploying the P0.1 + P0.2 fixes:
 *   pnpm tsx scripts/fix-payment-state.ts
 *
 * Safe to re-run: it only updates orders where the new value differs.
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const round2 = (n: number): number => Math.round(n * 100) / 100;

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  🛠️  Backfilling paidAmount / paymentStatus');
  console.log('═══════════════════════════════════════════════════\n');

  const orders = await db.order.findMany({
    include: { payments: true },
  });

  let fixed = 0;
  let skipped = 0;
  const changes: { id: string; num: string; from: any; to: any }[] = [];

  for (const o of orders) {
    // 1) For CANCELLED orders: force paidAmount=0, paymentStatus=UNPAID.
    if (o.status === 'CANCELLED') {
      if (o.paidAmount !== 0 || o.paymentStatus !== 'UNPAID') {
        const before = { paidAmount: o.paidAmount, paymentStatus: o.paymentStatus };
        await db.order.update({
          where: { id: o.id },
          data: { paidAmount: 0, paymentStatus: 'UNPAID' },
        });
        changes.push({ id: o.id, num: o.orderNumber, from: before, to: { paidAmount: 0, paymentStatus: 'UNPAID' } });
        fixed++;
        continue;
      }
      skipped++;
      continue;
    }

    // 2) For active orders: sum the actual Payment rows and reconcile.
    const sum = round2(o.payments.reduce((s, p) => s + Number(p.amount), 0));
    const expectedStatus =
      sum <= 0 ? 'UNPAID' : sum >= o.total - 0.001 ? 'PAID' : 'PARTIAL';

    const driftPaid = Math.abs(sum - o.paidAmount) > 0.01;
    const driftStatus = o.paymentStatus !== expectedStatus;
    // Also: if fully paid, status should be COMPLETED (or SERVED for DINE_IN done).
    const expectedOrderStatus =
      sum >= o.total - 0.001 && o.status !== 'COMPLETED' && o.status !== 'SERVED'
        ? 'COMPLETED'
        : null;

    if (!driftPaid && !driftStatus && !expectedOrderStatus) {
      skipped++;
      continue;
    }

    const before = {
      paidAmount: o.paidAmount,
      paymentStatus: o.paymentStatus,
      status: o.status,
    };
    const data: any = {};
    if (driftPaid) data.paidAmount = sum;
    if (driftStatus) data.paymentStatus = expectedStatus;
    if (expectedOrderStatus) data.status = expectedOrderStatus;
    if (data.status === 'COMPLETED' && !o.completedAt) data.completedAt = new Date();

    await db.order.update({ where: { id: o.id }, data });
    changes.push({ id: o.id, num: o.orderNumber, from: before, to: { ...before, ...data } });
    fixed++;
  }

  console.log(`📊 Scanned ${orders.length} orders`);
  console.log(`   ✅ Fixed:   ${fixed}`);
  console.log(`   ⏭️  Skipped: ${skipped} (already consistent)`);

  if (changes.length) {
    console.log('\n─── changes ───');
    for (const c of changes) {
      console.log(`  #${c.num}`);
      console.log('     from:', JSON.stringify(c.from));
      console.log('     to:  ', JSON.stringify(c.to));
    }
  }

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
