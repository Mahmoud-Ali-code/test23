/**
 * T-F: Audit log archiving.
 *
 * Runs as: `npm run db:archive-audit`  (or via cron)
 *
 * Behavior:
 *   1. Find all AuditLog rows older than ARCHIVE_DAYS (default 90).
 *   2. Write them to a JSON file under backups/audit-archive/YYYY-MM-DD.jsonl (one row per line).
 *   3. Delete the rows from the live table.
 *   4. Keep the last ARCHIVE_KEEP_JSON files; prune older ones.
 *
 * Why archive instead of delete?
 *   - Compliance: regulators sometimes want the financial trail for 2+ years.
 *   - Storage: live SQLite gets slow once AuditLog crosses ~100k rows.
 *   - Restore: a JSONL file is easy to re-import if we ever need to roll back.
 *
 * Run nightly:
 *   0 3 * * *  cd /path/to/backend && npx tsx scripts/archive-audit-logs.ts
 */
import { db } from '../src/config/prisma';
import * as fs from 'fs';
import * as path from 'path';

const ARCHIVE_DAYS = parseInt(process.env.ARCHIVE_DAYS || '90', 10);
const ARCHIVE_KEEP_JSON = parseInt(process.env.ARCHIVE_KEEP_JSON || '180', 10);
const ARCHIVE_DIR = process.env.ARCHIVE_DIR || path.resolve(__dirname, '..', 'backups', 'audit-archive');

async function main() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ARCHIVE_DAYS);

  console.log(`[archive] Archiving AuditLog rows older than ${cutoff.toISOString()} (${ARCHIVE_DAYS} days)`);

  if (!fs.existsSync(ARCHIVE_DIR)) {
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  }

  // Find rows to archive
  const rows = await db.auditLog.findMany({
    where: { createdAt: { lt: cutoff } },
    orderBy: { createdAt: 'asc' },
    take: 50_000, // safety cap per run
  });

  if (rows.length === 0) {
    console.log('[archive] Nothing to archive. ✓');
    return;
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  const file = path.join(ARCHIVE_DIR, `audit-${dateStr}.jsonl`);

  // Append each row as a JSONL line
  const lines: string[] = [];
  for (const r of rows) {
    lines.push(JSON.stringify({
      id: r.id,
      userId: r.userId,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      metadata: r.metadata,
      notes: r.notes,
      createdAt: r.createdAt,
    }));
  }
  fs.appendFileSync(file, lines.join('\n') + '\n', 'utf8');

  // Delete from live DB
  const ids = rows.map((r) => r.id);
  const del = await db.auditLog.deleteMany({ where: { id: { in: ids } } });

  console.log(`[archive] ✓ Archived ${del.count} row(s) → ${file}`);

  // Prune old JSONL files
  const all = fs.readdirSync(ARCHIVE_DIR)
    .filter((f) => f.startsWith('audit-') && f.endsWith('.jsonl'))
    .sort();
  if (all.length > ARCHIVE_KEEP_JSON) {
    const toRemove = all.slice(0, all.length - ARCHIVE_KEEP_JSON);
    for (const f of toRemove) {
      fs.unlinkSync(path.join(ARCHIVE_DIR, f));
    }
    console.log(`[archive] 🧹 Pruned ${toRemove.length} old archive file(s)`);
  }

  // Final stats
  const remaining = await db.auditLog.count();
  console.log(`[archive] Live AuditLog rows remaining: ${remaining}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[archive] ❌ Failed:', e);
    process.exit(1);
  });
