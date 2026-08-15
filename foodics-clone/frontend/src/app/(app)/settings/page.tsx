'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, formatSAR } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { toast } from '@/components/Toast';
import {
  Plus, Store as StoreIcon, Trash2, Save, Settings as SettingsIcon, Percent,
  Clock, AlertTriangle, FileText, Edit2, X, Check, Printer, Wifi, Usb,
} from 'lucide-react';

interface Branch {
  id: string;
  name: string;
  nameAr?: string;
  address?: string;
  phone?: string;
  isActive: boolean;
  taxRateDineIn: number;
  taxRateTakeaway: number;
  taxRateDelivery: number;
  businessDayStartHour: number;
  businessDayEndHour: number;
  _count?: { users: number; tables: number; orders: number };
}

export default function SettingsPage() {
  const router = useRouter();
  const { user, _hydrated } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [globalSettings, setGlobalSettings] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<'branches' | 'system' | 'printer'>('branches');
  const [form, setForm] = useState({ name: '', nameAr: '', address: '', phone: '' });

  useEffect(() => {
    if (!_hydrated) return;
    if (user?.role !== 'ADMIN') { router.push('/dashboard'); return; }
    load();
    loadGlobal();
  }, [user, _hydrated]);

  const load = async () => {
    try {
      const r = await api.get('/branches');
      setBranches(r.data.branches);
    } catch (e: any) {
      toast.error('فشل تحميل الفروع');
    }
  };
  const loadGlobal = async () => {
    try {
      const r = await api.get('/settings');
      setGlobalSettings(r.data.settings);
    } catch (e: any) {
      // manager-only — silently skip if forbidden
    }
  };

  const add = async () => {
    if (!form.name) return toast.warning('اسم الفرع مطلوب');
    try {
      await api.post('/branches', form);
      setForm({ name: '', nameAr: '', address: '', phone: '' });
      toast.success('تم إضافة الفرع');
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'فشل إضافة الفرع');
    }
  };
  const del = async (id: string) => {
    if (!confirm('حذف الفرع؟')) return;
    try { await api.delete(`/branches/${id}`); load(); toast.success('تم حذف الفرع'); }
    catch (e: any) { toast.error(e?.response?.data?.error || 'فشل الحذف'); }
  };

  return (
    <div className="p-6 lg:p-8 space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <SettingsIcon className="w-6 h-6" /> الإعدادات
        </h1>
        <p className="text-sm text-ink-500 mt-1">إدارة الفروع، الضرائب، ساعات العمل، وحدود الكاشير</p>
      </div>

      <div className="flex gap-2 border-b border-ink-200">
        <button
          onClick={() => setTab('branches')}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === 'branches' ? 'border-brand-600 text-brand-600' : 'border-transparent text-ink-500'}`}
        >
          <StoreIcon className="w-4 h-4 inline ml-1" /> الفروع
        </button>
        <button
          onClick={() => setTab('system')}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === 'system' ? 'border-brand-600 text-brand-600' : 'border-transparent text-ink-500'}`}
        >
          <Percent className="w-4 h-4 inline ml-1" /> إعدادات النظام
        </button>
        <button
          onClick={() => setTab('printer')}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === 'printer' ? 'border-brand-600 text-brand-600' : 'border-transparent text-ink-500'}`}
        >
          <Printer className="w-4 h-4 inline ml-1" /> الطابعة الحرارية
        </button>
      </div>

      {tab === 'branches' && (
        <div className="space-y-4">
          {/* Add new branch */}
          <div className="card p-4">
            <h2 className="font-semibold mb-3 flex items-center gap-2">
              <Plus className="w-4 h-4" /> إضافة فرع جديد
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <input className="input" placeholder="الاسم (إنجليزي)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input className="input" placeholder="الاسم (عربي)" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} />
              <input className="input" placeholder="العنوان" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              <div className="flex gap-2">
                <input className="input" placeholder="الهاتف" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                <button onClick={add} className="btn-primary"><Plus className="w-4 h-4" /></button>
              </div>
            </div>
          </div>

          {/* Branch list (editable) */}
          {branches.map((b) => (
            <BranchCard key={b.id} branch={b} onDelete={del} onReload={load} />
          ))}
        </div>
      )}

      {tab === 'system' && (
        <SystemSettings values={globalSettings} onReload={loadGlobal} />
      )}

      {tab === 'printer' && (
        <PrinterSettings />
      )}
    </div>
  );
}

/** F-H: Branch card with tax + business hours editor */
function BranchCard({ branch, onDelete, onReload }: { branch: Branch; onDelete: (id: string) => void; onReload: () => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: branch.name,
    nameAr: branch.nameAr || '',
    address: branch.address || '',
    phone: branch.phone || '',
    taxRateDineIn: branch.taxRateDineIn,
    taxRateTakeaway: branch.taxRateTakeaway,
    taxRateDelivery: branch.taxRateDelivery,
    businessDayStartHour: branch.businessDayStartHour,
    businessDayEndHour: branch.businessDayEndHour,
  });
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => { setDirty(false); }, [editing]);

  const update = (patch: any) => { setForm((f) => ({ ...f, ...patch })); setDirty(true); };

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/branches/${branch.id}`, form);
      toast.success('تم حفظ إعدادات الفرع');
      setEditing(false);
      onReload();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'فشل الحفظ');
    } finally { setSaving(false); }
  };

  const taxPct = (v: number) => `${(v * 100).toFixed(1)}%`;

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <StoreIcon className="w-5 h-5 text-brand-600" />
          <div>
            <div className="font-bold text-lg">{branch.nameAr || branch.name}</div>
            <div className="text-xs text-ink-500">
              {branch.address || 'لا يوجد عنوان'} {branch.phone && `• ${branch.phone}`}
            </div>
          </div>
        </div>
        <div className="flex gap-1">
          {!editing ? (
            <>
              <button onClick={() => setEditing(true)} className="btn-ghost text-xs">
                <Edit2 className="w-3 h-3" /> تعديل
              </button>
              <button onClick={() => onDelete(branch.id)} className="btn-ghost text-xs text-red-600">
                <Trash2 className="w-3 h-3" />
              </button>
            </>
          ) : (
            <>
              <button onClick={save} disabled={saving || !dirty} className="btn-primary text-xs">
                <Save className="w-3 h-3" /> {saving ? 'جاري الحفظ...' : 'حفظ'}
              </button>
              <button onClick={() => { setEditing(false); }} className="btn-ghost text-xs">
                <X className="w-3 h-3" /> إلغاء
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        {/* Tax rates */}
        <div className="bg-ink-50 rounded-lg p-3">
          <div className="font-semibold text-ink-700 mb-2 flex items-center gap-1">
            <Percent className="w-3.5 h-3.5" /> معدلات الضريبة
          </div>
          {editing ? (
            <div className="space-y-2">
              {(['taxRateDineIn', 'taxRateTakeaway', 'taxRateDelivery'] as const).map((k) => {
                const labels: any = { taxRateDineIn: 'صالة', taxRateTakeaway: 'تيك أواي', taxRateDelivery: 'توصيل' };
                return (
                  <div key={k} className="flex items-center gap-2">
                    <label className="w-20 text-xs">{labels[k]}</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={form[k]}
                      onChange={(e) => update({ [k]: parseFloat(e.target.value) || 0 })}
                      className="input flex-1 text-left"
                    />
                    <span className="text-xs text-ink-500 w-12 text-left">× 100</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-1 text-xs">
              <div>صالة: <b>{taxPct(branch.taxRateDineIn)}</b></div>
              <div>تيك أواي: <b>{taxPct(branch.taxRateTakeaway)}</b></div>
              <div>توصيل: <b>{taxPct(branch.taxRateDelivery)}</b></div>
            </div>
          )}
        </div>

        {/* Business hours */}
        <div className="bg-ink-50 rounded-lg p-3">
          <div className="font-semibold text-ink-700 mb-2 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" /> ساعات العمل (يوم العمل)
          </div>
          {editing ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="w-20 text-xs">يبدأ</label>
                <select
                  value={form.businessDayStartHour}
                  onChange={(e) => update({ businessDayStartHour: parseInt(e.target.value) })}
                  className="input flex-1"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>{h.toString().padStart(2, '0')}:00</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="w-20 text-xs">ينتهي</label>
                <select
                  value={form.businessDayEndHour}
                  onChange={(e) => update({ businessDayEndHour: parseInt(e.target.value) })}
                  className="input flex-1"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>{h.toString().padStart(2, '0')}:00</option>
                  ))}
                </select>
              </div>
              <p className="text-[10px] text-ink-500 mt-1">يبدأ في يوم X، ينتهي في يوم X+1</p>
            </div>
          ) : (
            <div className="space-y-1 text-xs">
              <div>يبدأ: <b>{branch.businessDayStartHour.toString().padStart(2, '0')}:00</b></div>
              <div>ينتهي: <b>{branch.businessDayEndHour.toString().padStart(2, '0')}:00</b> (في اليوم التالي)</div>
              <div className="text-ink-500">يستخدم لترقيم الأوردرات المتسلسل</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Thermal receipt printer settings. Pulled live from the backend's env-driven
 *  config; we don't allow changing it from the UI because the printer is wired
 *  to a specific physical host (the Windows POS machine in the restaurant).
 *  What we DO offer here is a "Test print" + a "Print last receipt" button so
 *  the admin can verify the connection from the UI. */
function PrinterSettings() {
  const [cfg, setCfg] = useState<any>(null);
  const [testing, setTesting] = useState(false);
  const [lastResult, setLastResult] = useState<{ ok: boolean; body?: string; error?: string } | null>(null);

  useEffect(() => {
    api.get('/print/config').then(r => setCfg(r.data)).catch(e => toast.error('فشل تحميل إعدادات الطابعة'));
  }, []);

  const testPrint = async () => {
    setTesting(true);
    setLastResult(null);
    try {
      const r = await api.post('/print/test');
      setLastResult(r.data);
      if (r.data.ok) toast.success(r.data.printerStatus === 'mock' ? 'تم توليد الإيصال التجريبي (mock)' : 'تم إرسال الإيصال التجريبي للطابعة');
      else toast.error('فشل: ' + (r.data.error || 'غير معروف'));
    } catch (e: any) {
      toast.error('فشل: ' + (e?.message || 'network error'));
      setLastResult({ ok: false, error: e?.message });
    } finally {
      setTesting(false);
    }
  };

  if (!cfg) return <div className="card p-4 text-ink-500">جاري التحميل…</div>;

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Printer className="w-5 h-5" /> الطابعة الحرارية (80mm ESC/POS)
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <Field label="نوع الاتصال" value={
            <span className="flex items-center gap-2">
              {cfg.type === 'network' && <Wifi className="w-4 h-4" />}
              {cfg.type === 'usb' && <Usb className="w-4 h-4" />}
              {cfg.type === 'mock' && <span>🧪</span>}
              {cfg.type === 'network' && 'Network (TCP)'}
              {cfg.type === 'usb' && 'USB (متصل بهذا الجهاز)'}
              {cfg.type === 'mock' && 'تجريبي (بدون طابعة)'}
            </span>
          } />
          {cfg.type === 'network' && <>
            <Field label="IP" value={cfg.ip || <em className="text-red-600">غير محدد</em>} />
            <Field label="Port" value={cfg.port} />
          </>}
          {cfg.type === 'usb' && <>
            <Field label="Vendor ID" value={cfg.usbVendorId || <em className="text-red-600">غير محدد</em>} />
            <Field label="Product ID" value={cfg.usbProductId || <em className="text-red-600">غير محدد</em>} />
          </>}
          <Field label="عرض الإيصال" value={cfg.width + 'mm'} />
          <Field label="قطع تلقائي" value={cfg.cut ? 'مفعّل' : 'متعطل'} />
          <Field label="فتح الكاشير" value={cfg.openDrawer ? 'تلقائي' : 'يدوي'} />
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-900">
          <strong>ملاحظة:</strong> الإعدادات دي بتتغير من ملف <code className="bg-amber-100 px-1 rounded">backend/.env</code> في الجهاز اللي الطابعة متوصلة بيه. لو الـ backend شغال على Windows في الـ restaurant، لازم تعدّل الـ <code>.env</code> هناك.
        </div>

        <button
          onClick={testPrint}
          disabled={testing}
          className="btn-primary w-full md:w-auto"
        >
          {testing ? 'جاري الطباعة…' : '🖨️ اطبع صفحة اختبار'}
        </button>
      </div>

      {lastResult && (
        <div className={`card p-4 ${lastResult.ok ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
          <div className="font-semibold mb-2 flex items-center gap-2">
            {lastResult.ok ? '✅' : '❌'} {lastResult.ok ? 'تمت الطباعة' : 'فشلت الطباعة'}
            {lastResult.error && <span className="text-sm text-red-600">— {lastResult.error}</span>}
          </div>
          {lastResult.body && (
            <pre className="text-xs bg-white p-3 rounded border border-ink-200 overflow-x-auto whitespace-pre font-mono" dir="ltr">
{lastResult.body}
            </pre>
          )}
        </div>
      )}

      <div className="card p-4 bg-ink-50 text-sm text-ink-700">
        <h3 className="font-semibold mb-2">إزاي تظبط الطابعة على Windows في الـ restaurant:</h3>
        <ol className="list-decimal list-inside space-y-1 mr-4">
          <li>نصّب <a href="https://zadig.akeo.ie" className="text-brand-600 underline" target="_blank" rel="noopener">Zadig</a> عشان يـ install الـ libusb driver للطابعة</li>
          <li>في Zadig: Options → List All Devices → اختار الطابعة → Install Driver</li>
          <li>افتح <code className="bg-white px-1 rounded">backend/.env</code> وظبط:
            <pre className="bg-white p-2 rounded mt-1 text-xs" dir="ltr">{`PRINTER_TYPE=usb
# Run 'usb-devices' or Device Manager → USB to find VID/PID
PRINTER_USB_VENDOR_ID=0x04b8  # Epson default
PRINTER_USB_PRODUCT_ID=0x0202`}</pre>
          </li>
          <li>أعد تشغيل الـ backend</li>
          <li>ارجع هنا واضغط "اطبع صفحة اختبار"</li>
        </ol>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div className="bg-ink-50 rounded-lg p-3">
      <div className="text-xs text-ink-500 mb-1">{label}</div>
      <div className="font-semibold text-ink-800">{value}</div>
    </div>
  );
}

/** F-H: System settings (refund limit, discount limit, receipt footer) */
function SystemSettings({ values, onReload }: { values: Record<string, string>; onReload: () => void }) {
  const [form, setForm] = useState({
    refund_cashier_limit: values.refund_cashier_limit || '200',
    discount_cashier_limit_pct: values.discount_cashier_limit_pct || '0.20',
    receipt_footer_ar: values.receipt_footer_ar || '',
  });
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setForm({
      refund_cashier_limit: values.refund_cashier_limit || '200',
      discount_cashier_limit_pct: values.discount_cashier_limit_pct || '0.20',
      receipt_footer_ar: values.receipt_footer_ar || '',
    });
    setDirty(false);
  }, [values]);

  const update = (patch: any) => { setForm((f) => ({ ...f, ...patch })); setDirty(true); };

  const save = async () => {
    setSaving(true);
    try {
      const payload: any = {
        refund_cashier_limit: form.refund_cashier_limit,
        discount_cashier_limit_pct: form.discount_cashier_limit_pct,
        receipt_footer_ar: form.receipt_footer_ar,
      };
      await api.put('/settings', payload);
      toast.success('تم حفظ إعدادات النظام');
      setDirty(false);
      onReload();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'فشل الحفظ');
    } finally { setSaving(false); }
  };

  const discountPct = (parseFloat(form.discount_cashier_limit_pct) * 100) || 0;

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600" /> حدود الكاشير
        </h2>
        <p className="text-xs text-ink-500">
          لو الكاشير حاول يعمل استرداد أو خصم أكبر من الحد، النظام هيطلب كلمة مرور المدير.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium block mb-1">حد الاسترداد النقدي (EGP)</label>
            <input
              type="number"
              min="0"
              step="10"
              value={form.refund_cashier_limit}
              onChange={(e) => update({ refund_cashier_limit: e.target.value })}
              className="input"
            />
            <p className="text-xs text-ink-500 mt-1">أقصى مبلغ يمكن للكاشير استرداده بدون موافقة المدير</p>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">حد نسبة الخصم (%)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={discountPct.toFixed(0)}
                onChange={(e) => update({ discount_cashier_limit_pct: (parseFloat(e.target.value) || 0) / 100 })}
                className="input flex-1"
              />
              <span className="text-sm">%</span>
            </div>
            <p className="text-xs text-ink-500 mt-1">نسبة الخصم القصوى بدون موافقة المدير</p>
          </div>
        </div>
      </div>

      <div className="card p-4 space-y-3">
        <h2 className="font-semibold flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-600" /> إعدادات الإيصال
        </h2>
        <div>
          <label className="text-sm font-medium block mb-1">رسالة أسفل الإيصال</label>
          <input
            type="text"
            value={form.receipt_footer_ar}
            onChange={(e) => update({ receipt_footer_ar: e.target.value })}
            className="input"
            placeholder="شكراً لزيارتكم — أبو الزلف"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={save} disabled={!dirty || saving} className="btn-primary">
          <Save className="w-4 h-4" /> {saving ? 'جاري الحفظ...' : 'حفظ التغييرات'}
        </button>
      </div>
    </div>
  );
}
