'use client';
import { useEffect, useState } from 'react';
import { api, formatDate } from '@/lib/api';
import {
  ScrollText, Search, Filter, RefreshCw, User as UserIcon, ChevronDown, ChevronRight, X,
  Banknote, Receipt, ScrollText as ScrollIcon, Undo2, ClipboardList, ShoppingCart, Box,
} from 'lucide-react';

// Map audit action → Arabic label + icon + color
const ACTION_META: any = {
  PAYMENT_CREATE:    { label: 'إضافة دفعة',          icon: Banknote,     color: 'emerald' },
  PAYMENT_REMOVE:    { label: 'حذف دفعة',            icon: Banknote,     color: 'red' },
  REFUND_CREATE:     { label: 'استرداد',              icon: Undo2,        color: 'red' },
  REFUND_REMOVE:     { label: 'عكس استرداد',          icon: Undo2,        color: 'amber' },
  EXPENSE_CREATE:    { label: 'إضافة مصروف',         icon: ScrollIcon,   color: 'amber' },
  EXPENSE_UPDATE:    { label: 'تعديل مصروف',          icon: ScrollIcon,   color: 'blue' },
  EXPENSE_REMOVE:    { label: 'حذف مصروف',           icon: ScrollIcon,   color: 'red' },
  INVENTORY_ADJUST:  { label: 'تعديل مخزون',         icon: Box,          color: 'amber' },
  SHIFT_OPEN:        { label: 'فتح شيفت',             icon: ScrollText,   color: 'emerald' },
  SHIFT_CLOSE:       { label: 'إغلاق شيفت',           icon: ScrollText,   color: 'blue' },
  ORDER_CANCEL:      { label: 'إلغاء أوردر',          icon: ShoppingCart, color: 'red' },
  ORDER_EDIT:        { label: 'تعديل أوردر',          icon: ClipboardList, color: 'blue' },
  CUSTOMER_UPSERT:   { label: 'تعديل/إنشاء عميل',    icon: UserIcon,     color: 'blue' },
};
const COLOR_CLASS: any = {
  emerald: 'bg-emerald-100 text-emerald-700',
  red: 'bg-red-100 text-red-700',
  amber: 'bg-amber-100 text-amber-700',
  blue: 'bg-blue-100 text-blue-700',
  purple: 'bg-purple-100 text-purple-700',
};

export default function AuditPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Filters
  const [action, setAction] = useState<string>('');
  const [entityType, setEntityType] = useState<string>('');
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [search, setSearch] = useState<string>('');

  const PAGE_SIZE = 100;

  const load = async (append = false) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const params = new URLSearchParams();
      if (action) params.set('action', action);
      if (entityType) params.set('entityType', entityType);
      if (from) params.set('from', new Date(from).toISOString());
      if (to) params.set('to', new Date(to).toISOString());
      params.set('limit', String(PAGE_SIZE));
      if (append && nextCursor) params.set('cursor', nextCursor);
      const r = await api.get(`/audit?${params}`);
      const newLogs = r.data.logs || [];
      setLogs(append ? [...logs, ...newLogs] : newLogs);
      setHasMore(r.data.hasMore || false);
      setNextCursor(r.data.nextCursor || null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => { load(); }, [action, entityType, from, to]);

  // Client-side search (since the backend search isn't text-based)
  const filtered = logs.filter((l) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      l.user?.name?.toLowerCase().includes(q) ||
      l.entityId?.toLowerCase().includes(q) ||
      l.notes?.toLowerCase().includes(q) ||
      ACTION_META[l.action]?.label?.toLowerCase().includes(q)
    );
  });

  const uniqueActions = Array.from(new Set(logs.map((l) => l.action)));
  const uniqueEntityTypes = Array.from(new Set(logs.map((l) => l.entityType)));

  return (
    <div className="p-6 lg:p-8 space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ScrollText className="w-6 h-6" /> سجل التدقيق
          </h1>
          <p className="text-sm text-ink-500 mt-1">كل تغيير في النظام — دفعات، استردادات، شيفتات، إلغاءات</p>
        </div>
        <button onClick={() => load()} className="btn-ghost" title="تحديث">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="card p-4 space-y-3">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
          <div className="col-span-2 relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث (اسم، معرف، ملاحظة...)"
              className="input pr-10 text-right"
            />
          </div>
          <select className="input" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">كل الأفعال</option>
            {uniqueActions.map((a) => (
              <option key={a} value={a}>{ACTION_META[a]?.label || a}</option>
            ))}
          </select>
          <select className="input" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
            <option value="">كل الكيانات</option>
            {uniqueEntityTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <div className="flex gap-1">
            <input type="date" className="input text-sm flex-1" value={from} onChange={(e) => setFrom(e.target.value)} title="من" />
            <input type="date" className="input text-sm flex-1" value={to} onChange={(e) => setTo(e.target.value)} title="إلى" />
          </div>
        </div>
        {(action || entityType || from || to || search) && (
          <button
            onClick={() => { setAction(''); setEntityType(''); setFrom(''); setTo(''); setSearch(''); }}
            className="text-xs text-brand-600 hover:underline flex items-center gap-1"
          >
            <X className="w-3 h-3" /> مسح الفلاتر
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center text-ink-400 py-12">جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center text-ink-400">
          <ScrollText className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>مفيش سجلات تطابق الفلاتر</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-ink-100">
            {filtered.map((l) => {
              const meta = ACTION_META[l.action] || { label: l.action, icon: ScrollText, color: 'ink' };
              const Icon = meta.icon;
              const colorCls = COLOR_CLASS[meta.color] || 'bg-ink-100 text-ink-700';
              const isOpen = expanded === l.id;
              return (
                <div key={l.id} className="hover:bg-ink-50 transition">
                  <button
                    onClick={() => setExpanded(isOpen ? null : l.id)}
                    className="w-full p-3 flex items-center gap-3 text-right"
                  >
                    <div className={`p-2 rounded-lg flex-shrink-0 ${colorCls}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm">{meta.label}</span>
                        {/* P1.8: show humanized entityRef.label instead of raw UUID */}
                        {l.entityRef?.label && (
                          <span className="text-xs text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded">{l.entityRef.label}</span>
                        )}
                        <span className="text-[10px] text-ink-400 font-mono">#{l.id.slice(-6)}</span>
                      </div>
                      <div className="text-xs text-ink-500 flex items-center gap-2 flex-wrap mt-0.5">
                        <span className="flex items-center gap-1"><UserIcon className="w-3 h-3" /> {l.user?.name || '—'}</span>
                        <span>•</span>
                        <span>{formatDate(l.createdAt)}</span>
                        {l.notes && <><span>•</span><span className="italic text-ink-600">{l.notes}</span></>}
                      </div>
                    </div>
                    <div className="text-xs text-ink-400 flex-shrink-0">
                      {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-3 pr-14 space-y-2">
                      {l.entityRef && (
                        <div className="text-xs text-ink-500">
                          <span className="font-semibold">الكيان:</span> {l.entityRef.label}
                        </div>
                      )}
                      {l.metadata && (
                        <div>
                          <div className="text-xs font-semibold text-ink-500 mb-1">التفاصيل:</div>
                          <pre className="text-xs bg-ink-50 p-2 rounded border border-ink-200 overflow-x-auto" dir="ltr">
                            {JSON.stringify(l.metadata, null, 2)}
                          </pre>
                        </div>
                      )}
                      <div className="text-xs text-ink-400">
                        معرف تقني: <span className="font-mono">{l.entityType}#{l.entityId}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {hasMore && (
            <div className="p-3 text-center border-t border-ink-100">
              <button
                onClick={() => load(true)}
                disabled={loadingMore}
                className="btn-secondary text-sm disabled:opacity-50"
              >
                {loadingMore ? 'جاري التحميل...' : `تحميل المزيد (${logs.length} من ${logs.length + 1}+)`}
              </button>
            </div>
          )}
          {!hasMore && logs.length > 0 && (
            <div className="p-2 text-center text-[10px] text-ink-400 border-t border-ink-100">
              {logs.length} سجل (نهاية القائمة)
            </div>
          )}
        </div>
      )}
    </div>
  );
}
