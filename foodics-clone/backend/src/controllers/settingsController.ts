import { Request, Response } from 'express';
import { db } from '../config/prisma';
import { writeAudit, AUDIT } from '../utils/auditLog';

/**
 * F-H: Global system settings (refund limit, discount limit, etc.).
 *
 * Stored in the Setting key/value table. Simple cache so we don't hit the DB
 * for every order / refund (limits are read in hot paths).
 */

export const SETTING_KEYS = {
  REFUND_CASHIER_LIMIT: 'refund_cashier_limit',           // EGP; cashier can refund up to this without manager PIN
  DISCOUNT_CASHIER_LIMIT_PCT: 'discount_cashier_limit_pct', // 0..1; cashier discount % above this needs manager PIN
  RECEIPT_FOOTER: 'receipt_footer_ar',                    // shown on printed receipts
  SHIFT_AUTO_OPEN: 'shift_auto_open',                     // 'true' to auto-open shift on first login
} as const;

export const SETTING_DEFAULTS: Record<string, string> = {
  [SETTING_KEYS.REFUND_CASHIER_LIMIT]: '200',
  [SETTING_KEYS.DISCOUNT_CASHIER_LIMIT_PCT]: '0.20',
  [SETTING_KEYS.RECEIPT_FOOTER]: 'شكراً لزيارتكم — أبو الزلف',
  [SETTING_KEYS.SHIFT_AUTO_OPEN]: 'false',
};

// Simple in-memory cache (60s TTL) — for the few hot-path limit checks
let cache: { at: number; map: Record<string, string> } | null = null;
const CACHE_TTL_MS = 60_000;

async function loadAll(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.map;
  const rows = await db.setting.findMany();
  const map: Record<string, string> = { ...SETTING_DEFAULTS };
  for (const r of rows) map[r.key] = r.value;
  cache = { at: now, map };
  return map;
}

/** Get a single setting with default fallback. Bypasses cache on miss. */
export async function getSetting(key: string): Promise<string> {
  const map = await loadAll();
  return map[key] ?? SETTING_DEFAULTS[key] ?? '';
}

/** Force-refresh after an admin update. */
function invalidateCache() {
  cache = null;
}

/** Parse a setting as a number with a default. */
export async function getSettingNumber(key: string, fallback: number): Promise<number> {
  const v = await getSetting(key);
  const n = parseFloat(v);
  return isFinite(n) ? n : fallback;
}

export const settingsController = {
  /** GET /api/settings — all settings (admin only) */
  async list(req: any, res: Response) {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'للمدراء فقط' });
    const map = await loadAll();
    return res.json({ settings: map });
  },

  /**
   * PUT /api/settings — update one or more settings.
   * body: { key: value, key2: value2, ... }
   * Only the keys in SETTING_KEYS are allowed; values are validated.
   */
  async update(req: any, res: Response) {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'للمدراء فقط' });
    const allowed = new Set(Object.values(SETTING_KEYS));
    const body = req.body || {};
    const updated: string[] = [];
    const previous: Record<string, string> = {};

    for (const [key, raw] of Object.entries(body)) {
      if (!allowed.has(key as any)) {
        return res.status(400).json({ error: `إعداد غير معروف: ${key}` });
      }
      const value = String(raw == null ? '' : raw).trim();
      // Per-key validation
      if (key === SETTING_KEYS.REFUND_CASHIER_LIMIT) {
        const n = parseFloat(value);
        if (!isFinite(n) || n < 0) return res.status(400).json({ error: 'حد الاسترداد يجب أن يكون رقم غير سالب' });
      }
      if (key === SETTING_KEYS.DISCOUNT_CASHIER_LIMIT_PCT) {
        const n = parseFloat(value);
        if (!isFinite(n) || n < 0 || n > 1) return res.status(400).json({ error: 'نسبة الخصم يجب أن تكون بين 0 و 1' });
      }
      // Read previous for audit
      const prev = await db.setting.findUnique({ where: { key } });
      previous[key] = prev?.value ?? SETTING_DEFAULTS[key] ?? '';
      await db.setting.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
      updated.push(key);
    }

    invalidateCache();
    if (updated.length) {
      await writeAudit(db, req.user.userId, AUDIT.SETTINGS_UPDATE, 'Setting', 'global', {
        keys: updated,
        previous,
        next: body,
      });
    }
    return res.json({ updated, count: updated.length });
  },
};
