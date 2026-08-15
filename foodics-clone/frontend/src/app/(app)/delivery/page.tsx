'use client';
import { useEffect, useState } from 'react';
import { api, formatSAR } from '@/lib/api';
import { toast } from '@/components/Toast';
import { Plus, Edit2, Trash2, X, Bike, DollarSign, FileText, Edit3, Check, AlertCircle } from 'lucide-react';

export default function DeliveryPage() {
  const [options, setOptions] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);

  useEffect(() => { load(); }, []);
  const load = async () => {
    try { const r = await api.get('/delivery-options'); setOptions(r.data.options); }
    catch (e: any) { toast.error('فشل التحميل'); }
  };
  const save = async (data: any) => {
    try {
      if (data.id) await api.put(`/delivery-options/${data.id}`, data);
      else await api.post('/delivery-options', data);
      setEditing(null); load();
      toast.success('تم الحفظ');
    } catch (e: any) { toast.error(e?.response?.data?.error || 'خطأ'); }
  };
  const del = async (id: string) => {
    if (!confirm('إلغاء تفعيل هذه الخدمة؟ الطلبات القديمة هتفضل موجودة.')) return;
    try { await api.delete(`/delivery-options/${id}`); load(); toast.success('تم الإلغاء'); }
    catch (e: any) { toast.error(e?.response?.data?.error || 'فشل الحذف'); }
  };

  return (
    <div className="p-6 lg:p-8 space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bike className="w-6 h-6" /> خدمات التوصيل
          </h1>
          <p className="text-ink-500 text-sm mt-1">{options.length} خدمة • فعّل خيار "قيمة مخصصة" لو الكاشير هيعدل الـ fee</p>
        </div>
        <button onClick={() => setEditing({
          fee: 0, isActive: true, allowCustomFee: false, minFee: null, maxFee: null,
        })} className="btn-primary">
          <Plus className="w-4 h-4" /> إضافة خدمة
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {options.map((o) => {
          const rangeText = o.allowCustomFee
            ? (o.minFee != null || o.maxFee != null
              ? `${o.minFee ?? 0} – ${o.maxFee ?? '∞'} EGP`
              : 'أي قيمة')
            : null;
          return (
            <div key={o.id} className="card p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${o.allowCustomFee ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'}`}>
                  <Bike className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold flex items-center gap-2">
                    {o.nameAr}
                    {o.allowCustomFee && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-700 flex items-center gap-1">
                        <Edit3 className="w-3 h-3" /> قيمة مخصصة
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-ink-500">{o.name}</div>
                </div>
              </div>
              {o.description && <p className="text-sm text-ink-600 mb-2">{o.description}</p>}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-ink-500">السعر الافتراضي</div>
                  <div className="text-2xl font-bold text-brand-600">{formatSAR(o.fee)}</div>
                </div>
                {o.allowCustomFee && (
                  <div className="text-left">
                    <div className="text-xs text-ink-500">الحد المسموح</div>
                    <div className="text-sm font-semibold text-amber-700">{rangeText}</div>
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={() => setEditing(o)} className="btn-secondary text-xs flex-1">
                  <Edit2 className="w-3 h-3" /> تعديل
                </button>
                <button onClick={() => del(o.id)} className="btn-secondary text-xs text-red-600">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
        {options.length === 0 && (
          <div className="col-span-full text-center text-ink-400 py-12">
            <Bike className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>لا توجد خدمات توصيل — ابدأ بإضافة واحدة</p>
          </div>
        )}
      </div>

      {editing && <DeliveryForm option={editing} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

function DeliveryForm({ option, onClose, onSave }: any) {
  const [form, setForm] = useState<any>({
    id: option.id,
    name: option.name || '',
    nameAr: option.nameAr || '',
    description: option.description || '',
    fee: option.fee ?? 0,
    isActive: option.isActive !== false,
    allowCustomFee: !!option.allowCustomFee,
    minFee: option.minFee ?? null,
    maxFee: option.maxFee ?? null,
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.name || !form.nameAr) return toast.warning('الاسم بالعربي والإنجليزي مطلوب');
    if (form.allowCustomFee) {
      if (form.minFee != null && form.maxFee != null && Number(form.minFee) > Number(form.maxFee)) {
        return toast.error('الحد الأدنى لازم يكون أقل من الحد الأقصى');
      }
    }
    setSaving(true);
    try {
      // Convert empty strings to null for the API
      const payload = {
        ...form,
        minFee: form.minFee === '' || form.minFee == null ? null : Number(form.minFee),
        maxFee: form.maxFee === '' || form.maxFee == null ? null : Number(form.maxFee),
        fee: Number(form.fee) || 0,
      };
      await onSave(payload);
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-ink-200 flex items-center justify-between">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Bike className="w-5 h-5 text-purple-600" />
            {option.id ? 'تعديل' : 'إضافة'} خدمة توصيل
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-ink-100 rounded"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div>
            <label className="text-sm font-medium block mb-1">الاسم بالعربي *</label>
            <input className="input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} placeholder="مثال: توصيل سريع" />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">الاسم بالإنجليزي *</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Express Delivery" />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">الوصف</label>
            <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="مثال: خلال 30 دقيقة" />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">السعر الافتراضي (EGP)</label>
            <input type="number" step="0.01" min="0" className="input" value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} />
            <p className="text-[10px] text-ink-500 mt-1">الـ price المعروض في الـ POS لو الخيار "قيمة مخصصة" مش مفعّل</p>
          </div>

          {/* F-H: Custom fee toggle */}
          <div className="border-t border-ink-200 pt-3">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.allowCustomFee}
                onChange={(e) => setForm({ ...form, allowCustomFee: e.target.checked })}
                className="w-4 h-4 mt-1"
              />
              <div>
                <div className="font-semibold text-sm flex items-center gap-1">
                  <Edit3 className="w-3.5 h-3.5 text-amber-600" /> السماح بقيمة مخصصة في الـ POS
                </div>
                <p className="text-[10px] text-ink-500 mt-0.5">
                  فعّل ده لو الكاشير لازم يعدّل الـ fee لكل أوردر (مثلاً: توصيل حسب المنطقة، توصيل VIP، ..)
                </p>
              </div>
            </label>

            {form.allowCustomFee && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2 space-y-2">
                <div className="flex items-start gap-1 text-[11px] text-amber-800">
                  <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>لو فاضي، الكاشير يقدر يدخل أي قيمة موجبة.</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium block mb-1">الحد الأدنى</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="input"
                      value={form.minFee ?? ''}
                      onChange={(e) => setForm({ ...form, minFee: e.target.value === '' ? null : e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium block mb-1">الحد الأقصى</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="input"
                      value={form.maxFee ?? ''}
                      onChange={(e) => setForm({ ...form, maxFee: e.target.value === '' ? null : e.target.value })}
                      placeholder="∞"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-ink-500">اتركهم فاضيين لو مش عايز حد أدنى/حد أقصى.</p>
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 pt-1">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="w-4 h-4" />
            <span className="text-sm">نشط</span>
          </label>
        </div>

        <div className="p-4 border-t border-ink-200 flex gap-2 justify-end">
          <button onClick={onClose} className="btn-secondary">إلغاء</button>
          <button onClick={submit} disabled={saving} className="btn-primary">
            <Check className="w-4 h-4" /> {saving ? 'جاري الحفظ...' : 'حفظ'}
          </button>
        </div>
      </div>
    </div>
  );
}
