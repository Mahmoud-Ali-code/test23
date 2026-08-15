#!/bin/bash
# ════════════════════════════════════════════════════════════════
# T-E: SQLite backup script (replaces the old PG pg_dump script)
# ════════════════════════════════════════════════════════════════
# Usage:
#   ./scripts/backup-sqlite.sh                  # daily backup to backups/
#   ./scripts/backup-sqlite.sh /path/to/backup  # custom destination
#
# Cron suggestion (every day at 02:00):
#   0 2 * * * /path/to/backend/scripts/backup-sqlite.sh >> /var/log/foodics-backup.log 2>&1
#
# Strategy:
#   - Use SQLite's `.backup` command (safer than `cp` on a live DB).
#   - Keep last 30 daily backups.
#   - Keep a "latest.db" symlink so other tools can grab the freshest one.
# ════════════════════════════════════════════════════════════════

set -e

# Resolve the script dir, then walk up to find the project root.
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Where the DB lives. Path is in backend/prisma/prisma/dev.db (per the README).
DB_PATH="${DB_PATH:-$PROJECT_ROOT/prisma/prisma/dev.db}"
DEST="${1:-$PROJECT_ROOT/backups}"

# Sanity
if [ ! -f "$DB_PATH" ]; then
  echo "❌ DB file not found at: $DB_PATH"
  echo "   Set DB_PATH env var to point at the right file."
  exit 1
fi

mkdir -p "$DEST"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATE=$(date +%Y%m%d)
BACKUP_FILE="$DEST/dev-$TIMESTAMP.db"
LATEST_LINK="$DEST/latest.db"
LOG_FILE="$DEST/backup.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "═══ Backup started ═══"
log "DB:    $DB_PATH"
log "Dest:  $DEST"

# ── Hot backup via SQLite .backup command ──
# This works even while the app is running. Uses the `sqlite3` CLI.
# Falls back to `cp` if sqlite3 is not installed (less safe but still works for
# most cases since WAL handles concurrent writes).
if command -v sqlite3 >/dev/null 2>&1; then
  log "📦 Using sqlite3 .backup (hot, safe)"
  sqlite3 "$DB_PATH" ".timeout 5000" ".backup '$BACKUP_FILE'"
else
  log "⚠️  sqlite3 not found — falling back to cp (less safe on live DBs)"
  cp "$DB_PATH" "$BACKUP_FILE"
  # Copy WAL + SHM too so the backup is consistent
  [ -f "$DB_PATH-wal" ] && cp "$DB_PATH-wal" "$BACKUP_FILE-wal"
  [ -f "$DB_PATH-shm" ] && cp "$DB_PATH-shm" "$BACKUP_FILE-shm"
fi

# Verify the backup file is non-empty
if [ ! -s "$BACKUP_FILE" ]; then
  log "❌ Backup file is empty — aborting"
  exit 1
fi

# Quick integrity check (only if sqlite3 is available)
if command -v sqlite3 >/dev/null 2>&1; then
  if sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;" | grep -q "^ok$"; then
    log "✅ Integrity check OK"
  else
    log "❌ Integrity check FAILED — backup may be corrupt"
    exit 1
  fi
fi

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
log "✅ Backup complete: $BACKUP_FILE ($SIZE)"

# ── Update the 'latest' symlink ──
ln -sf "$(basename "$BACKUP_FILE")" "$LATEST_LINK"
log "🔗 latest.db → $(basename "$BACKUP_FILE")"

# ── Cleanup: keep last 30 backups ──
COUNT=$(ls -1 "$DEST"/dev-*.db 2>/dev/null | wc -l | tr -d ' ')
if [ "$COUNT" -gt 30 ]; then
  REMOVED=$(ls -1t "$DEST"/dev-*.db | tail -n +31 | xargs rm -f | wc -l)
  log "🧹 Pruned $REMOVED old backup(s) (kept 30)"
fi

# ── Stats ──
TOTAL_SIZE=$(du -sh "$DEST" | cut -f1)
BACKUP_COUNT=$(ls -1 "$DEST"/dev-*.db 2>/dev/null | wc -l | tr -d ' ')
log "📊 Total: $TOTAL_SIZE | Backups on disk: $BACKUP_COUNT"
log "═══ Backup done ═══"
