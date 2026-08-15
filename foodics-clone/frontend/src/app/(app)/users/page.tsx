'use client';
import { useEffect, useState } from 'react';
import { api, formatDateShort } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { Plus, Edit2, Trash2, X, UserCog } from 'lucide-react';

const ROLES = [
  { v: 'ADMIN', l: 'مدير عام' },
  { v: 'MANAGER', l: 'مدير' },
  { v: 'CASHIER', l: 'كاشير' },
  { v: 'WAITER', l: 'ويتر' },
  { v: 'KITCHEN', l: 'مطبخ' },
];
const ROLE_LABELS: any = { ADMIN: 'مدير عام', MANAGER: 'مدير', CASHIER: 'كاشير', WAITER: 'ويتر', KITCHEN: 'مطبخ' };

export default function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);

  useEffect(() => { load(); }, []);
  const load = async () => { const r = await api.get('/users'); setUsers(r.data.users); };
  const del = async (id: string) => { if (!confirm('حذف الموظف؟')) return; await api.delete(`/users/${id}`); load(); };
  const save = async (data: any) => {
    try {
      if (data.id) await api.put(`/users/${data.id}`, data);
      else await api.post('/users', data);
      setEditing(null); load();
    } catch (e: any) { alert(e.response?.data?.error || 'خطأ'); }
  };

  return (
    <div className="p-6 lg:p-8 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">الموظفون</h1>
        {user?.role === 'ADMIN' && (
          <button onClick={() => setEditing({ role: 'CASHIER' })} className="btn-primary"><Plus className="w-4 h-4" /> إضافة موظف</button>
        )}
      </div>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ink-50">
            <tr className="text-right text-ink-500">
              <th className="p-3">الاسم</th><th className="p-3">البريد</th><th className="p-3">الصلاحية</th><th className="p-3">الهاتف</th><th className="p-3">الحالة</th><th className="p-3">تاريخ الإنشاء</th><th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-ink-100 hover:bg-ink-50">
                <td className="p-3"><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-semibold text-xs">{u.name.charAt(0)}</div>{u.name}</div></td>
                <td className="p-3 text-ink-600">{u.email}</td>
                <td className="p-3"><span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">{ROLE_LABELS[u.role] || u.role}</span></td>
                <td className="p-3 text-ink-600">{u.phone || '-'}</td>
                <td className="p-3">{u.isActive ? <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">نشط</span> : <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">معطل</span>}</td>
                <td className="p-3 text-xs text-ink-500">{formatDateShort(u.createdAt)}</td>
                <td className="p-3">
                  <div className="flex gap-1">
                    <button onClick={() => setEditing(u)} className="p-1.5 hover:bg-ink-200 rounded"><Edit2 className="w-3 h-3" /></button>
                    {u.id !== user?.id && <button onClick={() => del(u.id)} className="p-1.5 hover:bg-red-50 text-red-600 rounded"><Trash2 className="w-3 h-3" /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <UserForm user={editing} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

function UserForm({ user, onClose, onSave }: any) {
  const [form, setForm] = useState<any>({
    id: user.id, name: user.name || '', email: user.email || '',
    password: '', role: user.role || 'CASHIER', phone: user.phone || '',
    isActive: user.isActive !== false,
  });
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg flex items-center gap-2"><UserCog className="w-5 h-5" />{user.id ? 'تعديل' : 'إضافة'} موظف</h3>
          <button onClick={onClose} className="p-1 hover:bg-ink-100 rounded"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <div><label className="text-sm font-medium">الاسم</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="text-sm font-medium">البريد</label><input type="email" className="input" disabled={!!user.id} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          {!user.id && <div><label className="text-sm font-medium">كلمة المرور</label><input type="password" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>}
          <div><label className="text-sm font-medium">الصلاحية</label>
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
            </select>
          </div>
          <div><label className="text-sm font-medium">الهاتف</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> نشط</label>
        </div>
        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className="btn-secondary flex-1">إلغاء</button>
          <button onClick={() => onSave(form)} className="btn-primary flex-1">حفظ</button>
        </div>
      </div>
    </div>
  );
}
