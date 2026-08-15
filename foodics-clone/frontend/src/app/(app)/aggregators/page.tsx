'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, formatSAR } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { toast } from '@/components/Toast';
import {
  Plus, Trash2, Edit2, Save, X, Webhook, Key, Check, AlertTriangle, Code, Settings as SettingsIcon, RefreshCw, Copy, FileText,
} from 'lucide-react';

const FIELD_LABELS: Record<string, string> = {
  externalOrderId: 'رقم الأوردر من المنصة',
  customerName: 'اسم العميل',
  customerPhone: 'هاتف العميل',
  customerAddress: 'عنوان العميل',
  items: 'مسار قائمة الأصناف',
  itemSku: 'SKU (كود الصنف)',
  itemName: 'اسم الصنف',
  itemQuantity: 'الكمية',
  itemPrice: 'سعر الوحدة',
  subtotal: 'الإجمالي قبل الضريبة',
  deliveryFee: 'رسوم التوصيل',
  total: 'الإجمالي الكلي',
  notes: 'ملاحظات',
};

const DEFAULT_FIELDS = Object.keys(FIELD_LABELS);

interface Aggregator {
  id: string;
  name: string;
  code: string;
  webhookSecret: string | null;
  hasSecret: boolean;
  fieldMapping: string;
  isActive: boolean;
  branchId: string | null;
  branch?: { id: string; name: string; nameAr?: string };
  _count?: { orders: number; webhookLogs: number };
  createdBy?: { id: string; name: string };
}

export default function AggregatorsPage() {
  const router = useRouter();
  const { user, _hydrated } = useAuth();
  const [aggregators, setAggregators] = useState<Aggregator[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [editing, setEditing] = useState<Aggregator | null>(null);
  const [creating, setCreating] = useState(false);
  const [showLogsFor, setShowLogsFor] = useState<string | null>(null);
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    if (!_hydrated) return;
    if (user?.role !== 'ADMIN') { router.push('/dashboard'); return; }
    load();
    api.get('/branches').then((r) => setBranches(r.data.branches)).catch(() => {});
  }, [user, _hydrated]);

  const load = async () => {
    try {
      const r = await api.get('/aggregators');
      setAggregators(r.data.aggregators);
    } catch (e: any) {
      toast.error('فشل تحميل المنصات');
    }
  };

  const loadLogs = async (aggregatorId: string) => {
    setShowLogsFor(aggregatorId);
    try {
      const r = await api.get(`/aggregators/logs?aggregatorId=${aggregatorId}&limit=20`);
      setLogs(r.data.logs);
    } catch (e: any) { toast.error('فشل تحميل السجل'); }
  };

  const remove = async (a: Aggregator) => {
    if (!confirm(`إلغاء تفعيل منصة "${a.name}"؟ الطلبات القديمة هتفضل موجودة.`)) return;
    try {
      await api.delete(`/aggregators/${a.id}`);
      toast.success('تم إلغاء التفعيل');
      load();
    } catch (e: any) { toast.error(e?.response?.data?.error || 'فشل الحذف'); }
  };

  const copy = (s: string) => {
    navigator.clipboard?.writeText(s);
    toast.success('تم النسخ');
  };

  return (
    <div className="p-6 lg:p-8 space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Webhook className="w-6 h-6" /> منصات التوصيل
          </h1>
          <p className="text-sm text-ink-500 mt-1">
            ربط المطعم بمنصات التوصيل (طلبات مصر، talabat، elmenus، ..). كل منصة بتبعت أوردرات على webhook URL.
          </p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> إضافة منصة
        </button>
      </div>

      {/* Aggregator list */}
      <div className="space-y-3">
        {aggregators.length === 0 ? (
          <div className="card p-12 text-center text-ink-400">
            <Webhook className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>مفيش منصات مضافة. ابدأ بإضافة "طلبات مصر" أو أي منصة توصيل.</p>
          </div>
        ) : (
          aggregators.map((a) => {
            const mapping = safeParse(a.fieldMapping, {});
            const webhookUrl = `${typeof window !== 'undefined' ? window.location.protocol : 'http'}//${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:4000/api/webhooks/aggregators/${a.code}`;
            return (
              <div key={a.id} className="card p-4">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="bg-purple-100 p-2 rounded-lg">
                      <Webhook className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <div className="font-bold flex items-center gap-2">
                        {a.name}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${a.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-ink-100 text-ink-500'}`}>
                          {a.isActive ? 'نشط' : 'معطل'}
                        </span>
                      </div>
                      <div className="text-xs text-ink-500">
                        code: <code className="bg-ink-100 px-1.5 py-0.5 rounded">{a.code}</code>
                        {a.branch && <> • {a.branch.nameAr || a.branch.name}</>}
                        {a._count && <> • {a._count.orders} أوردر • {a._count.webhookLogs} log</>}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setEditing(a)} className="btn-ghost text-xs">
                      <Edit2 className="w-3 h-3" /> تعديل
                    </button>
                    <button onClick={() => loadLogs(a.id)} className="btn-ghost text-xs">
                      <FileText className="w-3 h-3" /> السجل
                    </button>
                    {a.isActive && (
                      <button onClick={() => remove(a)} className="btn-ghost text-xs text-red-600">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Webhook URL + secret */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                  <div className="bg-ink-50 rounded-lg p-2">
                    <div className="text-[10px] text-ink-500 mb-1 flex items-center gap-1">
                      <Code className="w-3 h-3" /> Webhook URL
                    </div>
                    <div className="flex items-center gap-1">
                      <code className="flex-1 truncate font-mono text-[11px]">{webhookUrl}</code>
                      <button onClick={() => copy(webhookUrl)} className="p-1 hover:bg-ink-200 rounded" title="نسخ">
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div className="bg-ink-50 rounded-lg p-2">
                    <div className="text-[10px] text-ink-500 mb-1 flex items-center gap-1">
                      <Key className="w-3 h-3" /> Secret
                    </div>
                    <div className="flex items-center gap-1">
                      <code className="flex-1 truncate font-mono text-[11px]">
                        {a.hasSecret ? '•••••••• (مخفي — استخدم صفحة التعديل لتغييره)' : '(لم يضبط — يقبل كل الطلبات)'}
                      </code>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Create/Edit modal */}
      {(creating || editing) && (
        <AggregatorForm
          aggregator={editing}
          branches={branches}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); load(); }}
        />
      )}

      {/* Logs modal */}
      {showLogsFor && (
        <LogsModal logs={logs} onClose={() => { setShowLogsFor(null); setLogs([]); }} />
      )}
    </div>
  );
}

function safeParse(s: string, fallback: any) {
  try { return JSON.parse(s); } catch { return fallback; }
}

function AggregatorForm({ aggregator, branches, onClose, onSaved }: { aggregator: Aggregator | null; branches: any[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<{
    name: string;
    code: string;
    webhookSecret: string;
    isActive: boolean;
    branchId: string;
    fieldMapping: Record<string, string>;
  }>(() => {
    if (aggregator) {
      return {
        name: aggregator.name,
        code: aggregator.code,
        webhookSecret: '', // never pre-fill, we set it only if user types
        isActive: aggregator.isActive,
        branchId: aggregator.branchId || '',
        fieldMapping: safeParse(aggregator.fieldMapping, {}),
      };
    }
    // New: start with defaults
    return {
      name: '',
      code: '',
      webhookSecret: '',
      isActive: true,
      branchId: '',
      fieldMapping: {
        externalOrderId: 'orderId',
        customerName: 'customer.name',
        customerPhone: 'customer.phone',
        customerAddress: 'customer.address',
        items: 'items',
        itemSku: 'sku',
        itemName: 'name',
        itemQuantity: 'quantity',
        itemPrice: 'unitPrice',
        subtotal: 'subtotal',
        deliveryFee: 'deliveryFee',
        total: 'total',
        notes: 'notes',
      },
    };
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name || !form.code) return toast.warning('الاسم والـ code مطلوبان');
    if (!/^[a-z0-9_-]+$/i.test(form.code)) return toast.warning('الـ code لازم يكون حروف إنجليزية وأرقام و - _ بس');
    setSaving(true);
    try {
      const payload: any = {
        name: form.name,
        code: form.code.toLowerCase(),
        isActive: form.isActive,
        branchId: form.branchId || null,
        fieldMapping: form.fieldMapping,
      };
      // Only send webhookSecret if user typed something (allow clearing with empty)
      if (form.webhookSecret !== '' || !aggregator) {
        payload.webhookSecret = form.webhookSecret;
      } else if (aggregator?.hasSecret === false) {
        // User wants to clear the secret
        payload.webhookSecret = '';
      }
      if (aggregator) {
        await api.put(`/aggregators/${aggregator.id}`, payload);
        toast.success('تم تحديث المنصة');
      } else {
        await api.post('/aggregators', payload);
        toast.success('تم إضافة المنصة');
      }
      onSaved();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'فشل الحفظ');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 pt-12" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-ink-200 bg-gradient-to-l from-purple-50 to-white flex items-center justify-between">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Webhook className="w-5 h-5 text-purple-600" />
            {aggregator ? `تعديل منصة ${aggregator.name}` : 'إضافة منصة جديدة'}
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-ink-100 rounded"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Basic info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1">اسم المنصة</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: طلبات مصر" />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Code (يستخدم في الـ URL)</label>
              <input className="input font-mono" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="otlob_masr" />
              <p className="text-[10px] text-ink-500 mt-1">حروف إنجليزية صغيرة + أرقام + - _</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1 flex items-center gap-1">
                <Key className="w-3 h-3" /> Webhook Secret (HMAC)
              </label>
              <input
                type="text"
                className="input font-mono"
                value={form.webhookSecret}
                onChange={(e) => setForm({ ...form, webhookSecret: e.target.value })}
                placeholder={aggregator?.hasSecret ? '•••••••• (اتركه فاضي عشان تحتفظ بالقديم)' : 'shared secret مع المنصة'}
              />
              <p className="text-[10px] text-ink-500 mt-1">
                لو فاضي: يقبل أي request (mode=dev). لو مظبوط: الـ request لازم يكون عليه HMAC-SHA256 في X-Aggregator-Signature.
              </p>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">الفرع</label>
              <select className="input" value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
                <option value="">(الافتراضي — أول فرع)</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.nameAr || b.name}</option>)}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input id="active" type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="w-4 h-4" />
            <label htmlFor="active" className="text-sm">المنصة مفعّلة (يقبل أوردرات)</label>
          </div>

          {/* Field mapping */}
          <div className="border-t border-ink-200 pt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold flex items-center gap-2">
                <SettingsIcon className="w-4 h-4" /> Field Mapping
              </h4>
              <button
                onClick={() => setForm({ ...form, fieldMapping: {
                  externalOrderId: 'orderId', customerName: 'customer.name', customerPhone: 'customer.phone',
                  customerAddress: 'customer.address', items: 'items', itemSku: 'sku', itemName: 'name',
                  itemQuantity: 'quantity', itemPrice: 'unitPrice', subtotal: 'subtotal',
                  deliveryFee: 'deliveryFee', total: 'total', notes: 'notes',
                }})}
                className="btn-ghost text-xs"
              >
                <RefreshCw className="w-3 h-3" /> رجوع للـ defaults
              </button>
            </div>
            <p className="text-xs text-ink-500 mb-3">
              كل حقل في الـ payload المنصة بتعمله path (dot-notation). مثلاً <code className="bg-ink-100 px-1">customer.name</code> يقرأ من <code className="bg-ink-100 px-1">payload.customer.name</code>.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {DEFAULT_FIELDS.map((k) => (
                <div key={k} className="flex items-center gap-2 bg-ink-50 rounded-lg p-2">
                  <label className="text-xs font-medium w-32 shrink-0 text-ink-700">{FIELD_LABELS[k]}</label>
                  <code className="text-[10px] text-ink-400 w-4">→</code>
                  <input
                    className="input flex-1 font-mono text-xs"
                    value={form.fieldMapping[k] || ''}
                    onChange={(e) => setForm({ ...form, fieldMapping: { ...form.fieldMapping, [k]: e.target.value } })}
                    placeholder={k}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-ink-200 flex gap-2 justify-end">
          <button onClick={onClose} className="btn-secondary">إلغاء</button>
          <button onClick={save} disabled={saving} className="btn-primary">
            <Save className="w-4 h-4" /> {saving ? 'جاري الحفظ...' : 'حفظ'}
          </button>
        </div>
      </div>
    </div>
  );
}

function LogsModal({ logs, onClose }: { logs: any[]; onClose: () => void }) {
  const statusBadge: Record<string, string> = {
    PROCESSED: 'bg-emerald-100 text-emerald-700',
    FAILED: 'bg-red-100 text-red-700',
    IGNORED: 'bg-amber-100 text-amber-700',
    RECEIVED: 'bg-blue-100 text-blue-700',
  };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 pt-12" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-ink-200 flex items-center justify-between">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <FileText className="w-5 h-5" /> Webhook Logs
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-ink-100 rounded"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {logs.length === 0 ? (
            <div className="text-center text-ink-400 py-12">مفيش requests مسجلة</div>
          ) : (
            logs.map((l) => (
              <div key={l.id} className="border border-ink-200 rounded-lg p-3 text-xs">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${statusBadge[l.status] || 'bg-ink-100'}`}>
                      {l.status}
                    </span>
                    <span className="text-ink-500">{new Date(l.createdAt).toLocaleString('ar-EG')}</span>
                    {l.processingMs != null && <span className="text-ink-400">• {l.processingMs}ms</span>}
                  </div>
                  <div className="flex items-center gap-2 text-ink-500">
                    {l.externalOrderId && <code className="bg-ink-100 px-1.5 py-0.5 rounded">{l.externalOrderId}</code>}
                    {l.ip && <span>IP: {l.ip}</span>}
                  </div>
                </div>
                {l.error && <div className="bg-red-50 text-red-700 rounded p-2 mb-2">{l.error}</div>}
                <details>
                  <summary className="cursor-pointer text-ink-500 hover:text-ink-700">عرض الـ payload</summary>
                  <pre className="mt-2 p-2 bg-ink-50 rounded text-[10px] overflow-x-auto max-h-40">{l.payload}</pre>
                </details>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
