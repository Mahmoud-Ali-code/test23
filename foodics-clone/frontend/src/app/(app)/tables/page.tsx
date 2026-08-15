'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Plus, Edit2, Trash2, X } from 'lucide-react';

export default function TablesPage() {
  const [tables, setTables] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);

  useEffect(() => { load(); }, []);
  const load = async () => { const r = await api.get('/tables'); setTables(r.data.tables); };
  const save = async (data: any) => {
    try {
      if (data.id) await api.put(`/tables/${data.id}`, data);
      else await api.post('/tables', { ...data, branchId: tables[0]?.branchId || '' });
      setEditing(null); load();
    } catch (e: any) { alert(e.response?.data?.error || 'خطأ'); }
  };
  const del = async (id: string) => { if (!confirm('حذف الطاولة؟')) return; await api.delete(`/tables/${id}`); load(); };

  const colors: any = { AVAILABLE: 'border-emerald-300 bg-emerald-50', OCCUPIED: 'border-red-300 bg-red-50', RESERVED: 'border-amber-300 bg-amber-50' };
  const statusEmoji: any = { AVAILABLE: '✅ متاحة', OCCUPIED: '🔴 مشغولة', RESERVED: '⏰ محجوزة' };

  return (
    <div className="p-6 lg:p-8 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">الطاولات</h1>
        <button onClick={() => setEditing({ number: '', capacity: 4, status: 'AVAILABLE' })} className="btn-primary text-sm"><Plus className="w-4 h-4" /> طاولة</button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {tables.map((t) => (
          <div key={t.id} className={`rounded-2xl p-4 border-2 ${colors[t.status]} relative`}>
            <button onClick={() => setEditing(t)} className="absolute top-1 right-1 p-1 hover:bg-ink-200 rounded"><Edit2 className="w-3 h-3" /></button>
            <button onClick={() => del(t.id)} className="absolute top-1 left-1 p-1 hover:bg-red-50 text-red-600 rounded"><Trash2 className="w-3 h-3" /></button>
            <div className="text-center">
              <div className="text-xs text-ink-500">طاولة</div>
              <div className="text-3xl font-bold">{t.number}</div>
              <div className="text-xs text-ink-500 mt-1">👥 {t.capacity} كرسي</div>
              <div className="mt-2 text-xs font-medium">{statusEmoji[t.status]}</div>
            </div>
          </div>
        ))}
      </div>
      {editing && <TableForm table={editing} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

function TableForm({ table, onClose, onSave }: any) {
  const [form, setForm] = useState<any>({
    id: table.id, number: table.number || '', capacity: table.capacity || 4, status: table.status || 'AVAILABLE',
  });
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">{table.id ? 'تعديل' : 'إضافة'} طاولة</h3>
          <button onClick={onClose} className="p-1 hover:bg-ink-100 rounded"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <div><label className="text-sm font-medium">رقم الطاولة</label><input className="input" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} /></div>
          <div><label className="text-sm font-medium">عدد الكراسي</label><input type="number" className="input" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: parseInt(e.target.value) || 4 })} /></div>
          <div><label className="text-sm font-medium">الحالة</label>
            <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="AVAILABLE">متاحة</option>
              <option value="OCCUPIED">مشغولة</option>
              <option value="RESERVED">محجوزة</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className="btn-secondary flex-1">إلغاء</button>
          <button onClick={() => onSave(form)} className="btn-primary flex-1">حفظ</button>
        </div>
      </div>
    </div>
  );
}
