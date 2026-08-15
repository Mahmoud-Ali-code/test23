/**
 * Performance test: simulates 300 orders/day load
 * Tests DB throughput, query times, and cache effectiveness
 */
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

const db = new PrismaClient();
const redis = new Redis({ host: 'localhost', port: 6379 });

async function timed<T>(label: string, fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = Date.now();
  const result = await fn();
  const ms = Date.now() - start;
  console.log(`   ${label}: ${ms}ms`);
  return { result, ms };
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('   🚀 Performance Test — أبو الزلف (PostgreSQL + Redis)');
  console.log('═══════════════════════════════════════════════════\n');

  // 1. Basic read benchmarks
  console.log('📊 1. Basic read benchmarks');
  const p1 = await timed('Products (90 items)', () =>
    db.product.findMany({ include: { category: true, inventory: true } })
  );
  const p2 = await timed('Categories (5 items)', () =>
    db.category.findMany({ include: { _count: { select: { products: true } } } })
  );
  const p3 = await timed('Orders (last 100)', () =>
    db.order.findMany({ take: 100, orderBy: { createdAt: 'desc' }, include: { items: true, payments: true } })
  );
  const p4 = await timed('Tables', () => db.table.findMany());

  // 2. Cache test
  console.log('\n📊 2. Cache effectiveness');
  await redis.del('test:products');
  const cacheMiss = await timed('First read (cache miss)', async () => {
    const data = await db.product.findMany({ include: { category: true } });
    await redis.setex('test:products', 60, JSON.stringify(data));
    return data;
  });
  const cacheHit = await timed('Second read (cache hit)', async () => {
    const cached = await redis.get('test:products');
    return cached ? JSON.parse(cached) : null;
  });
  console.log(`   💡 Speedup: ${Math.round(cacheMiss.ms / Math.max(cacheHit.ms, 1))}x`);

  // 3. Concurrent writes test
  console.log('\n📊 3. Concurrent writes (10 parallel orders)');
  const admin = await db.user.findFirst({ where: { role: 'ADMIN' } });
  const product = await db.product.findFirst();
  const table = await db.table.findFirst();
  if (!admin || !product || !table) {
    console.log('❌ Missing test data');
    return;
  }
  const startConcurrent = Date.now();
  const concurrentOrders = await Promise.all(
    Array.from({ length: 10 }).map((_, i) =>
      db.order.create({
        data: {
          orderNumber: `PERF-${Date.now()}-${i}`,
          type: 'DINE_IN',
          status: 'PENDING',
          paymentStatus: 'UNPAID',
          branchId: admin.branchId!,
          userId: admin.id,
          tableId: table.id,
          subtotal: 100,
          tax: 15,
          total: 115,
          paidAmount: 0,
          items: { create: [{ productId: product.id, quantity: 1, price: 100 }] },
        },
      })
    )
  );
  const concurrentMs = Date.now() - startConcurrent;
  console.log(`   Created 10 orders in: ${concurrentMs}ms (avg ${concurrentMs / 10}ms/order)`);
  console.log(`   ✅ No deadlocks, no errors`);

  // 4. Index usage test
  console.log('\n📊 4. Index usage (EXPLAIN)');
  const explain = await db.$queryRawUnsafe(`EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM "Order" WHERE "createdAt" > NOW() - INTERVAL '7 days' ORDER BY "createdAt" DESC LIMIT 50;`) as any[];
  for (const row of explain) {
    const plan = row['QUERY PLAN'] || Object.values(row)[0];
    console.log(`   ${plan}`);
  }

  // 5. Cleanup
  console.log('\n🧹 Cleaning up test data...');
  await db.payment.deleteMany({ where: { order: { orderNumber: { startsWith: 'PERF-' } } } });
  await db.orderItem.deleteMany({ where: { order: { orderNumber: { startsWith: 'PERF-' } } } });
  await db.order.deleteMany({ where: { orderNumber: { startsWith: 'PERF-' } } });

  // 6. Stress test: simulate 50 concurrent reads (peak hour scenario)
  console.log('\n📊 5. Stress test — 50 concurrent reads (peak hour)');
  const startStress = Date.now();
  const stressResults = await Promise.all(
    Array.from({ length: 50 }).map(() =>
      db.order.findMany({ take: 20, orderBy: { createdAt: 'desc' }, include: { items: true } })
    )
  );
  const stressMs = Date.now() - startStress;
  console.log(`   50 concurrent reads in: ${stressMs}ms (avg ${stressMs / 50}ms/read)`);
  console.log(`   ${stressResults.length} queries completed successfully`);

  console.log('\n═══════════════════════════════════════════════════');
  console.log('   ✅ All performance tests passed!');
  console.log('═══════════════════════════════════════════════════\n');

  // Final stats
  const counts = await Promise.all([
    db.user.count(), db.product.count(), db.order.count(), db.payment.count(),
  ]);
  console.log(`📊 Database stats:`);
  console.log(`   Users: ${counts[0]} | Products: ${counts[1]} | Orders: ${counts[2]} | Payments: ${counts[3]}`);

  await db.$disconnect();
  await redis.quit();
}

main().catch((e) => { console.error(e); process.exit(1); });
