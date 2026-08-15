'use client';
import { useEffect, useState } from 'react';
import { api, formatSAR, formatDate } from '@/lib/api';
import {
  Plus, Edit2, Trash2, X, ScrollText, Banknote, CreditCard, Smartphone,
  Truck, FileText, Building, AlertCircle,
} from 'lucide-react';

const CATEGORIES = ['إيجار', 'كهرباء ومياه', 'مرتبات', 'تسويق', 'مستلزمات', 'صيانة', 'أخرى'];

const METHOD_LABELS: any = {
  CASH: { label: 'كاش', icon: Banknote, color: 'emerald' },
  CARD: { label: 'بطاقة', icon: CreditCard, color: 'blue' },
  INSTAPAY: { label: 'إنستاباي', icon: Smartphone, color: 'purple' },
  BANK_TRANSFER: { label: 'تحويل بنكي', icon: Building, color: 'amber' },
  CHEQUE: { label: 'شيك', icon: FileText, color: 'ink' },
};

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [byMethod, setByMethod] = useState<Record<string, number>>({});
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const [e, s] = await Promise.all([api.get('/expenses'), api.get('/suppliers')]);
      setExpenses(e.data.expenses || []);
      setByMethod(e.data.byMethod || {});
      setSuppliers(s.data.suppliers || []);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'فشل التحميل');
    }
  };

  const save = async (data: any) => {
    try {
      if (data.id) await api.put(`/expenses/${data.id}`, data);
      else await api.post('/expenses', data);
      setEditing(null);
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.error || e?.message || 'فشل الحفظ');
    }
  };
  const del = async (id: string) => {
    if (!confirm('حذف المصروف؟')) return;
    try {
      await api.delete(`/expenses/${id}`);
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.error || e?.message || 'فشل الحذف');
    }
  };

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const cashTotal = byMethod.CASH || 0;
  const cardTotal = (byMethod.CARD || 0) + (byMethod.INSTAPAY || 0) + (byMethod.BANK_TRANSFER || 0) + (byMethod.CHEQUE || 0);

  return (
    <div className="p-6 lg:p-8 space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ScrollText className="w-6 h-6" /> المصروفات
          </h1>
          <p className="text-sm text-ink-500 mt-1">كل المصروفات — مرتبطة بطريقة الدفع والمورد</p>
        </div>
        <button onClick={() => setEditing({})} className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> مصروف جديد
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatBox label="إجمالي المصروفات" value={formatSAR(total)} color="red" />
        <StatBox label="نقدية (كاش)" value={formatSAR(cashTotal)} color="emerald" />
        <StatBox label="إلكتروني" value={formatSAR(cardTotal)} color="blue" />
        <StatBox label="عدد المصروفات" value={expenses.length} color="purple" />
      </div>

      {/* By method breakdown */}
      <div className="card p-4">
        <div className="text-sm font-semibold mb-2">التوزيع حسب طريقة الدفع</div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(METHOD_LABELS).map(([m, cfg]: any) => {
            const v = byMethod[m] || 0;
            if (v === 0) return null;
            const Icon = cfg.icon;
            const pct = total > 0 ? (v / total * 100) : 0;
            return (
              <div key={m} className={`flex items-center gap-1.5 bg-${cfg.color}-50 border border-${cfg.color}-200 rounded-full px-3 py-1`}>
                <Icon className={`w-3.5 h-3.5 text-${cfg.color}-600`} />
                <span className="text-xs font-bold">{cfg.label}</span>
                <span className={`text-xs text-${cfg.color}-700`}>{formatSAR(v)}</span>
                <span className="text-[10px] text-ink-500">({pct.toFixed(0)}%)</span>
              </div>
            );
          })}
          {Object.values(byMethod).every((v) => !v) && (
            <div className="text-xs text-ink-400">مفيش توزيع</div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ink-50">
            <tr className="text-right text-ink-500">
              <th className="p-3">التاريخ</th>
              <th className="p-3">الفئة</th>
              <th className="p-3">الوصف</th>
              <th className="p-3">المورد</th>
              <th className="p-3">طريقة الدفع</th>
              <th className="p-3">مرجع</th>
              <th className="p-3">المبلغ</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((e) => {
              const m = METHOD_LABELS[e.paymentMethod] || METHOD_LABELS.CASH;
              const Icon = m.icon;
              return (
                <tr key={e.id} className="border-t border-ink-100 hover:bg-ink-50">
                  <td className="p-3 text-ink-500 text-xs">{formatDate(e.date)}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded-full text-xs bg-ink-100 text-ink-700">{e.category}</span>
                  </td>
                  <td className="p-3">{e.description}</td>
                  <td className="p-3 text-xs">
                    {e.supplier ? (
                      <span className="flex items-center gap-1 text-ink-600">
                        <Truck className="w-3 h-3" /> {e.supplier.nameAr || e.supplier.name}
                      </span>
                    ) : <span className="text-ink-300">—</span>}
                  </td>
                  <td className="p-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-${m.color}-50 text-${m.color}-700 border border-${m.color}-200`}>
                      <Icon className="w-3 h-3" /> {m.label}
                    </span>
                  </td>
                  <td className="p-3 text-xs font-mono text-ink-500">{e.reference || '—'}</td>
                  <td className="p-3 font-bold text-red-600">-{formatSAR(e.amount)}</td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <button onClick={() => setEditing(e)} className="p-1.5 hover:bg-ink-200 rounded">
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button onClick={() => del(e.id)} className="p-1.5 hover:bg-red-50 text-red-600 rounded">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {expenses.length === 0 && (
              <tr><td colSpan={8} className="text-center text-ink-400 py-12">لا توجد مصروفات</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <ExpenseForm
          expense={editing}
          suppliers={suppliers}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}
    </div>
  );
}

function StatBox({ label, value, color }: any) {
  const c: any = {
    red: 'border-red-200 bg-red-50',
    emerald: 'border-emerald-200 bg-emerald-50',
    blue: 'border-blue-200 bg-blue-50',
    purple: 'border-purple-200 bg-purple-50',
  };
  return (
    <div className={`rounded-2xl p-4 border ${c[color]}`}>
      <div className="text-xs text-ink-600">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}

function ExpenseForm({ expense, suppliers, onClose, onSave }: any) {
  const [form, setForm] = useState({
    id: expense.id,
    category: expense.category || 'مستلزمات',
    description: expense.description || '',
    amount: expense.amount || 0,
    date: expense.date ? expense.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
    paymentMethod: expense.paymentMethod || 'CASH',
    supplierId: expense.supplierId || '',
    reference: expense.reference || '',
  });
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose} dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-ink-200 flex items-center justify-between">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <ScrollText className="w-5 h-5" />
            {expense.id ? 'تعديل مصروف' : 'مصروف جديد'}
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-ink-100 rounded"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-sm font-medium block mb-1">الفئة *</label>
              <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">التاريخ *</label>
              <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">الوصف *</label>
            <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="مثلاً: فاتورة كهرباء شهر 8" />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">المبلغ *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="input text-lg"
              value={form.amount || ''}
              onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
              placeholder="0.00"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-sm font-medium block mb-1">طريقة الدفع *</label>
              <select className="input" value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
                {Object.entries(METHOD_LABELS).map(([k, v]: any) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">المورد (اختياري)</label>
              <select className="input" value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
                <option value="">بدون مورد</option>
                {suppliers.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.nameAr || s.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">مرجع (رقم فاتورة / شيك / تحويل)</label>
            <input className="input" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="اختياري" />
          </div>
          {form.paymentMethod === 'CASH' && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-800 flex items-center gap-1.5">
              <Banknote className="w-3.5 h-3.5" />
              المصروف النقدي بيتخصم من تسوية الكاش في الشيفت
            </div>
          )}
        </div>
        <div className="p-4 border-t border-ink-200 flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">إلغاء</button>
          <button
            onClick={() => onSave({
              ...form,
              supplierId: form.supplierId || null,
              reference: form.reference || null,
            })}
            disabled={!form.description || !form.amount}
            className="btn-primary flex-1 disabled:opacity-50"
          >
            حفظ
          </button>
        </div>
      </div>
    </div>
  );
}
