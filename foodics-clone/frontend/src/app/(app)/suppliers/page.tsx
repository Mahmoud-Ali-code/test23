'use client';
import { useEffect, useState } from 'react';
import { api, formatSAR, formatDate } from '@/lib/api';
import { Plus, Edit2, Trash2, X, Truck, Receipt, FileText, Phone, Mail, MapPin, FileDown } from 'lucide-react';

const INVOICE_STATUS: any = {
  UNPAID: 'badge-warning',
  PARTIAL: 'badge-info',
  PAID: 'badge-success',
};
const INVOICE_LABEL: any = { UNPAID: 'غير مدفوع', PARTIAL: 'مدفوع جزئياً', PAID: 'مدفوع' };

export default function SuppliersPage() {
  const [tab, setTab] = useState<'suppliers' | 'invoices'>('suppliers');
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [editingSupplier, setEditingSupplier] = useState<any>(null);
  const [editingInvoice, setEditingInvoice] = useState<any>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const [s, i] = await Promise.all([api.get('/suppliers'), api.get('/invoices')]);
    setSuppliers(s.data.suppliers);
    setInvoices(i.data.invoices);
  };

  const saveSupplier = async (data: any) => {
    try {
      if (data.id) await api.put(`/suppliers/${data.id}`, data);
      else await api.post('/suppliers', data);
      setEditingSupplier(null); load();
    } catch (e: any) { alert(e.response?.data?.error || 'خطأ'); }
  };
  const delSupplier = async (id: string) => {
    if (!confirm('حذف المورد؟')) return;
    await api.delete(`/suppliers/${id}`); load();
  };

  const saveInvoice = async (data: any) => {
    try {
      if (data.id) await api.put(`/invoices/${data.id}`, data);
      else await api.post('/invoices', data);
      setEditingInvoice(null); load();
    } catch (e: any) { alert(e.response?.data?.error || 'خطأ'); }
  };
  const delInvoice = async (id: string) => {
    if (!confirm('حذف الفاتورة؟')) return;
    await api.delete(`/invoices/${id}`); load();
  };

  const downloadPDF = async (id: string, num: string) => {
    const token = localStorage.getItem('token');
    const r = await fetch(`/api/exports/orders/${id}.pdf`, { headers: { Authorization: `Bearer ${token}` } });
    const b = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = `invoice-${num}.pdf`;
    a.click();
  };

  return (
    <div className="p-6 lg:p-8 space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">الموردين والفواتير</h1>
        <div className="flex gap-2">
          {tab === 'suppliers' ? (
            <button onClick={() => setEditingSupplier({})} className="btn-primary text-sm">
              <Plus className="w-4 h-4" /> مورد جديد
            </button>
          ) : (
            <button onClick={() => setEditingInvoice({})} className="btn-primary text-sm">
              <Plus className="w-4 h-4" /> فاتورة جديدة
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 border-b border-ink-200">
        <button onClick={() => setTab('suppliers')}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === 'suppliers' ? 'border-brand-600 text-brand-600' : 'border-transparent text-ink-500'}`}>
          <Truck className="w-4 h-4 inline ml-1" /> الموردين ({suppliers.length})
        </button>
        <button onClick={() => setTab('invoices')}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === 'invoices' ? 'border-brand-600 text-brand-600' : 'border-transparent text-ink-500'}`}>
          <Receipt className="w-4 h-4 inline ml-1" /> الفواتير ({invoices.length})
        </button>
      </div>

      {tab === 'suppliers' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {suppliers.map((s) => (
            <div key={s.id} className="card p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-lg bg-brand-100 text-brand-700 flex items-center justify-center font-bold">
                    <Truck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold">{s.nameAr || s.name}</div>
                    {s.nameAr && s.name !== s.nameAr && <div className="text-xs text-ink-500">{s.name}</div>}
                  </div>
                </div>
              </div>
              {s.phone && <div className="text-sm text-ink-600 flex items-center gap-1 mt-2"><Phone className="w-3 h-3" /> {s.phone}</div>}
              {s.email && <div className="text-sm text-ink-600 flex items-center gap-1"><Mail className="w-3 h-3" /> {s.email}</div>}
              {s.address && <div className="text-sm text-ink-600 flex items-center gap-1"><MapPin className="w-3 h-3" /> {s.address}</div>}
              <div className="text-xs text-ink-500 mt-2">
                {s._count?.ingredients || 0} مكون • {s._count?.invoices || 0} فاتورة
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={() => setEditingSupplier(s)} className="btn-secondary text-xs flex-1"><Edit2 className="w-3 h-3" /> تعديل</button>
                <button onClick={() => delSupplier(s.id)} className="btn-secondary text-xs text-red-600"><Trash2 className="w-3 h-3" /></button>
              </div>
            </div>
          ))}
          {suppliers.length === 0 && <div className="col-span-full text-center text-ink-400 py-12">لا يوجد موردين</div>}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ink-50">
              <tr className="text-right text-ink-500">
                <th className="p-3">رقم الفاتورة</th>
                <th className="p-3">المورد</th>
                <th className="p-3">التاريخ</th>
                <th className="p-3">المبلغ</th>
                <th className="p-3">المدفوع</th>
                <th className="p-3">المتبقي</th>
                <th className="p-3">الحالة</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-t border-ink-100 hover:bg-ink-50">
                  <td className="p-3 font-mono">{inv.number}</td>
                  <td className="p-3">{inv.supplier?.nameAr || inv.supplier?.name}</td>
                  <td className="p-3 text-xs text-ink-500">{formatDate(inv.date)}</td>
                  <td className="p-3 font-bold">{formatSAR(inv.amount)}</td>
                  <td className="p-3 text-emerald-600">{formatSAR(inv.paid)}</td>
                  <td className="p-3 text-red-600">{formatSAR(inv.amount - inv.paid)}</td>
                  <td className="p-3"><span className={`badge ${INVOICE_STATUS[inv.status]}`}>{INVOICE_LABEL[inv.status]}</span></td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <button onClick={() => setEditingInvoice(inv)} className="p-1.5 hover:bg-ink-200 rounded"><Edit2 className="w-3 h-3" /></button>
                      <button onClick={() => delInvoice(inv.id)} className="p-1.5 hover:bg-red-50 text-red-600 rounded"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && <tr><td colSpan={8} className="text-center text-ink-400 py-12">لا توجد فواتير</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {editingSupplier && <SupplierForm supplier={editingSupplier} onClose={() => setEditingSupplier(null)} onSave={saveSupplier} />}
      {editingInvoice && <InvoiceForm invoice={editingInvoice} suppliers={suppliers} onClose={() => setEditingInvoice(null)} onSave={saveInvoice} />}
    </div>
  );
}

function SupplierForm({ supplier, onClose, onSave }: any) {
  const [form, setForm] = useState<any>({
    id: supplier.id, name: supplier.name || '', nameAr: supplier.nameAr || '',
    phone: supplier.phone || '', email: supplier.email || '', address: supplier.address || '', notes: supplier.notes || '',
  });
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg flex items-center gap-2"><Truck className="w-5 h-5" />{supplier.id ? 'تعديل' : 'إضافة'} مورد</h3>
          <button onClick={onClose} className="p-1 hover:bg-ink-100 rounded"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <div><label className="text-sm font-medium">الاسم بالعربي</label><input className="input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} /></div>
          <div><label className="text-sm font-medium">الاسم بالإنجليزي</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="text-sm font-medium">الهاتف</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><label className="text-sm font-medium">البريد</label><input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><label className="text-sm font-medium">العنوان</label><input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div><label className="text-sm font-medium">ملاحظات</label><textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className="btn-secondary flex-1">إلغاء</button>
          <button onClick={() => onSave(form)} className="btn-primary flex-1">حفظ</button>
        </div>
      </div>
    </div>
  );
}

function InvoiceForm({ invoice, suppliers, onClose, onSave }: any) {
  const [form, setForm] = useState<any>({
    id: invoice.id, number: invoice.number || '', supplierId: invoice.supplierId || '',
    amount: invoice.amount || 0, paid: invoice.paid || 0,
    date: invoice.date ? invoice.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
    dueDate: invoice.dueDate ? invoice.dueDate.slice(0, 10) : '',
    notes: invoice.notes || '',
  });
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg flex items-center gap-2"><Receipt className="w-5 h-5" />{invoice.id ? 'تعديل' : 'إضافة'} فاتورة</h3>
          <button onClick={onClose} className="p-1 hover:bg-ink-100 rounded"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <div><label className="text-sm font-medium">رقم الفاتورة</label><input className="input" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} /></div>
          <div><label className="text-sm font-medium">المورد</label>
            <select className="input" value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
              <option value="">اختر مورد</option>
              {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.nameAr || s.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-sm font-medium">التاريخ</label><input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            <div><label className="text-sm font-medium">استحقاق</label><input type="date" className="input" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-sm font-medium">المبلغ الإجمالي</label><input type="number" className="input" value={form.amount} onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })} /></div>
            <div><label className="text-sm font-medium">المدفوع</label><input type="number" className="input" value={form.paid} onChange={(e) => setForm({ ...form, paid: parseFloat(e.target.value) || 0 })} /></div>
          </div>
          <div><label className="text-sm font-medium">ملاحظات</label><textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className="btn-secondary flex-1">إلغاء</button>
          <button onClick={() => onSave(form)} className="btn-primary flex-1">حفظ</button>
        </div>
      </div>
    </div>
  );
}
