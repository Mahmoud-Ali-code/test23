/**
 * Migration script: SQLite → PostgreSQL
 * Copies all data from the old SQLite dev.db to the new PostgreSQL abouzoelf_pos
 */
import { PrismaClient as PgClient } from '@prisma/client';
import Database from 'better-sqlite3';
import * as path from 'path';

const pg = new PgClient();
const sqlitePath = process.env.SQLITE_PATH || path.join(__dirname, '..', 'prisma', 'dev.db');
const sqlite = new Database(sqlitePath);
sqlite.pragma('journal_mode = WAL');

async function main() {
  console.log('📦 قراءة البيانات من SQLite...');
  const tables = ['User', 'Branch', 'Category', 'Product', 'Ingredient', 'Recipe',
    'Table', 'DeliveryOption', 'Supplier', 'SupplierInvoice', 'SupplierInvoiceItem',
    'Inventory', 'InventoryMovement', 'Expense', 'Setting', 'Session',
    'ProductIngredient'];

  // Order matters: parents first
  const order = ['Branch', 'User', 'Category', 'Product', 'Ingredient', 'Recipe',
    'Table', 'DeliveryOption', 'Supplier', 'SupplierInvoice', 'SupplierInvoiceItem',
    'Inventory', 'InventoryMovement', 'Expense', 'Setting', 'Session',
    'ProductIngredient', 'Order', 'OrderItem', 'OrderDeliveryOption', 'Payment'];

  // Wipe target DB first
  console.log('🧹 تنظيف PostgreSQL...');
  // Delete in reverse FK order
  for (const t of [...order].reverse()) {
    try {
      const model = (pg as any)[t.charAt(0).toLowerCase() + t.slice(1)];
      if (model?.deleteMany) await model.deleteMany({});
    } catch (e: any) { console.log(`   (skip ${t}: ${e.message})`); }
  }

  // Insert
  for (const t of order) {
    const rows: any[] = sqlite.prepare(`SELECT * FROM "${t}"`).all();
    if (rows.length === 0) { console.log(`⏭  ${t} (فاضي)`); continue; }
    console.log(`📥 ${t}: ${rows.length} سجل...`);
    const model = (pg as any)[t.charAt(0).toLowerCase() + t.slice(1)];
    if (!model?.createMany) { console.log(`   ⚠️  مفيش model لـ ${t}`); continue; }
    // Convert dates and ensure JSON safety
    const cleanRows = rows.map((r) => {
      const out: any = {};
      for (const [k, v] of Object.entries(r)) {
        if (v === null || v === undefined) out[k] = null;
        else if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(v)) {
          out[k] = new Date(v.replace(' ', 'T') + 'Z');
        }
        else if (typeof v === 'number' && (k === 'createdAt' || k === 'updatedAt' || k === 'completedAt' || k === 'expiresAt')) {
          // SQLite stores as ms timestamp integer
          out[k] = new Date(v);
        }
        else if (typeof v === 'number' && (k === 'isActive' || k === 'isAvailable' || k === 'isFavorite')) {
          out[k] = v === 1; // boolean conversion
        }
        else if (typeof v === 'number') out[k] = v;
        else out[k] = v;
      }
      return out;
    });
    try {
      await model.createMany({ data: cleanRows });
      console.log(`   ✅ ${t}: ${cleanRows.length} سجل اتنقل`);
    } catch (e: any) {
      console.log(`   ❌ ${t}: ${e.message}`);
    }
  }

  console.log('\n✅ Migration finished!');
  const counts = await Promise.all([
    pg.user.count(), pg.product.count(), pg.category.count(),
    pg.order.count(), pg.payment.count(), pg.table.count(),
  ]);
  console.log(`\n📊 الإحصائيات:`);
  console.log(`   Users: ${counts[0]}`);
  console.log(`   Products: ${counts[1]}`);
  console.log(`   Categories: ${counts[2]}`);
  console.log(`   Orders: ${counts[3]}`);
  console.log(`   Payments: ${counts[4]}`);
  console.log(`   Tables: ${counts[5]}`);

  await pg.$disconnect();
  sqlite.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
