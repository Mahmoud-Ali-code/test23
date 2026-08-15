'use client';
import { useEffect, useState } from 'react';
import { api, formatSAR } from '@/lib/api';
import { Plus, Minus, AlertTriangle, Edit2, Trash2, X, Package, Wheat, Activity, Filter, ChevronDown } from 'lucide-react';

export default function InventoryPage() {
  const [tab, setTab] = useState<'products' | 'ingredients' | 'movements'>('products');
  const [products, setProducts] = useState<any[]>([]);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [showLow, setShowLow] = useState(false);
  const [editingIng, setEditingIng] = useState<any>(null);

  useEffect(() => { load(); }, [showLow]);
  const load = async () => {
    const [p, i] = await Promise.all([api.get(`/inventory${showLow ? '?lowStock=true' : ''}`), api.get('/ingredients')]);
    setProducts(p.data.inventory);
    setIngredients(i.data.ingredients);
  };

  const adjust = async (productId: string, type: 'IN' | 'OUT') => {
    const reason = prompt(`سبب ${type === 'IN' ? 'الإضافة' : 'السحب'}:`);
    if (!reason) return;
    const qty = parseFloat(prompt('الكمية:') || '0');
    if (!qty) return;
    await api.post(`/inventory/${productId}/adjust`, { type, quantity: qty, reason });
    load();
  };

  const saveIngredient = async (data: any) => {
    try {
      if (data.id) await api.put(`/ingredients/${data.id}`, data);
      else await api.post('/ingredients', data);
      setEditingIng(null); load();
    } catch (e: any) { alert(e.response?.data?.error || 'خطأ'); }
  };
  const delIngredient = async (id: string) => { if (!confirm('حذف المكون؟')) return; await api.delete(`/ingredients/${id}`); load(); };

  return (
    <div className="p-6 lg:p-8 space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">المخزون</h1>
        <div className="flex gap-2">
          {tab === 'products' && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showLow} onChange={(e) => setShowLow(e.target.checked)} />
              عرض المنخفض فقط
            </label>
          )}
          {tab === 'ingredients' && (
            <button onClick={() => setEditingIng({ stock: 0, minStock: 0, unit: 'kg', cost: 0 })} className="btn-primary text-sm">
              <Plus className="w-4 h-4" /> إضافة مكون
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 border-b border-ink-200">
        <button onClick={() => setTab('products')}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === 'products' ? 'border-brand-600 text-brand-600' : 'border-transparent text-ink-500'}`}>
          <Package className="w-4 h-4 inline ml-1" /> مخزون المنتجات ({products.length})
        </button>
        <button onClick={() => setTab('ingredients')}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === 'ingredients' ? 'border-brand-600 text-brand-600' : 'border-transparent text-ink-500'}`}>
          <Wheat className="w-4 h-4 inline ml-1" /> المكونات الخام ({ingredients.length})
        </button>
        <button onClick={() => setTab('movements')}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === 'movements' ? 'border-brand-600 text-brand-600' : 'border-transparent text-ink-500'}`}>
          <Activity className="w-4 h-4 inline ml-1" /> الحركات
        </button>
      </div>

      {tab === 'products' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((inv) => {
            const low = inv.stock <= inv.minStock;
            return (
              <div key={inv.id} className={`card p-4 ${low ? 'border-amber-300 bg-amber-50/50' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className="text-4xl">{inv.product.image || '🍽️'}</div>
                  <div className="flex-1 min-w-0 text-right">
                    <div className="font-semibold">{inv.product.nameAr || inv.product.name}</div>
                    <div className="text-xs text-ink-500">{inv.product.category.nameAr}</div>
                  </div>
                  {low && <AlertTriangle className="w-5 h-5 text-amber-500" />}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-ink-500">الكمية</div>
                    <div className={`text-2xl font-bold ${low ? 'text-amber-700' : ''}`}>{inv.stock} <span className="text-sm text-ink-500">{inv.unit === 'pcs' ? 'قطعة' : inv.unit}</span></div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-ink-500">الحد الأدنى</div>
                    <div className="text-lg font-semibold">{inv.minStock}</div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button onClick={() => adjust(inv.productId, 'IN')} className="btn-secondary text-xs"><Plus className="w-3 h-3" /> إضافة</button>
                  <button onClick={() => adjust(inv.productId, 'OUT')} className="btn-secondary text-xs"><Minus className="w-3 h-3" /> سحب</button>
                </div>
              </div>
            );
          })}
        </div>
      ) : tab === 'ingredients' ? (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ink-50">
              <tr className="text-right text-ink-500">
                <th className="p-3">المكون</th>
                <th className="p-3">الوحدة</th>
                <th className="p-3">الكمية</th>
                <th className="p-3">الحد الأدنى</th>
                <th className="p-3">التكلفة</th>
                <th className="p-3">المورد</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {ingredients.map((ing) => {
                const low = ing.stock <= ing.minStock;
                return (
                  <tr key={ing.id} className={`border-t border-ink-100 hover:bg-ink-50 ${low ? 'bg-amber-50/50' : ''}`}>
                    <td className="p-3 font-medium">{ing.nameAr || ing.name}</td>
                    <td className="p-3">{ing.unit}</td>
                    <td className={`p-3 font-bold ${low ? 'text-amber-700' : ''}`}>{ing.stock}</td>
                    <td className="p-3 text-ink-500">{ing.minStock}</td>
                    <td className="p-3">{formatSAR(ing.cost)}</td>
                    <td className="p-3 text-ink-500 text-xs">{ing.supplier?.nameAr || '-'}</td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <button onClick={() => setEditingIng(ing)} className="p-1.5 hover:bg-ink-200 rounded"><Edit2 className="w-3 h-3" /></button>
                        <button onClick={() => delIngredient(ing.id)} className="p-1.5 hover:bg-red-50 text-red-600 rounded"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <MovementsTab />
      )}

      {editingIng && <IngredientForm ing={editingIng} onClose={() => setEditingIng(null)} onSave={saveIngredient} />}
    </div>
  );
}

function IngredientForm({ ing, onClose, onSave }: any) {
  const [form, setForm] = useState<any>({
    id: ing.id, name: ing.name || '', nameAr: ing.nameAr || ing.name || '',
    unit: ing.unit || 'kg', stock: ing.stock || 0, minStock: ing.minStock || 0, cost: ing.cost || 0,
  });
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">{ing.id ? 'تعديل' : 'إضافة'} مكون</h3>
          <button onClick={onClose} className="p-1 hover:bg-ink-100 rounded"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <div><label className="text-sm font-medium">الاسم بالعربي</label><input className="input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} /></div>
          <div><label className="text-sm font-medium">الاسم بالإنجليزي</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-sm font-medium">الوحدة</label>
              <select className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                <option value="kg">كيلو</option>
                <option value="g">جرام</option>
                <option value="l">لتر</option>
                <option value="ml">مل</option>
                <option value="pcs">قطعة</option>
              </select>
            </div>
            <div><label className="text-sm font-medium">التكلفة/الوحدة</label><input type="number" className="input" value={form.cost} onChange={(e) => setForm({ ...form, cost: parseFloat(e.target.value) || 0 })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-sm font-medium">الكمية الحالية</label><input type="number" className="input" value={form.stock} onChange={(e) => setForm({ ...form, stock: parseFloat(e.target.value) || 0 })} /></div>
            <div><label className="text-sm font-medium">الحد الأدنى</label><input type="number" className="input" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: parseFloat(e.target.value) || 0 })} /></div>
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

/**
 * F-G: Inventory Movements Tab
 *
 * Shows the full audit trail of inventory changes (sales, restocks, manual adjustments,
 * order edits, cancellations). Supports filtering by type and pagination.
 */
function MovementsTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<string>('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = async (reset = true) => {
    if (reset) { setLoading(true); setCursor(null); }
    else setLoadingMore(true);
    try {
      const params: any = { limit: 50 };
      if (type) params.type = type;
      if (!reset && cursor) params.cursor = cursor;
      const r = await api.get('/inventory/movements', { params });
      const list = r.data.movements || [];
      setRows(reset ? list : [...rows, ...list]);
      setHasMore(!!r.data.hasMore);
      setCursor(r.data.nextCursor);
    } catch (e: any) {
      console.error('[movements] load error', e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => { load(true); }, [type]);

  // Stat cards
  const totals = {
    in: rows.filter((r) => r.type === 'IN').reduce((s, r) => s + r.quantity, 0),
    out: rows.filter((r) => r.type === 'OUT').reduce((s, r) => s + r.quantity, 0),
    adj: rows.filter((r) => r.type === 'ADJUSTMENT').length,
  };

  const typeLabel: Record<string, { label: string; color: string; icon: string }> = {
    IN: { label: 'إضافة', color: 'emerald', icon: '+' },
    OUT: { label: 'سحب', color: 'amber', icon: '−' },
    ADJUSTMENT: { label: 'تعديل', color: 'blue', icon: '↔' },
  };

  return (
    <div className="space-y-4">
      {/* Filters + stats */}
      <div className="card p-3 flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-ink-500" />
        <button
          onClick={() => setType('')}
          className={`px-3 py-1 text-xs rounded-full font-bold ${!type ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-200'}`}
        >الكل</button>
        {(['IN', 'OUT', 'ADJUSTMENT'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`px-3 py-1 text-xs rounded-full font-bold ${type === t ? `bg-${typeLabel[t].color}-600 text-white` : 'bg-ink-100 text-ink-700 hover:bg-ink-200'}`}
          >
            {typeLabel[t].icon} {typeLabel[t].label}
          </button>
        ))}
        <div className="flex-1" />
        <div className="text-xs text-ink-500 flex gap-3">
          <span>إضافات: <b className="text-emerald-600">+{totals.in.toFixed(1)}</b></span>
          <span>سحوبات: <b className="text-amber-600">−{totals.out.toFixed(1)}</b></span>
          <span>تعديلات: <b className="text-blue-600">{totals.adj}</b></span>
        </div>
      </div>

      {/* Movements table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ink-50">
            <tr className="text-right text-ink-500">
              <th className="p-3">التاريخ</th>
              <th className="p-3">النوع</th>
              <th className="p-3">الصنف</th>
              <th className="p-3">الكمية</th>
              <th className="p-3">السبب</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="p-8 text-center text-ink-400">جاري التحميل...</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={5} className="p-8 text-center text-ink-400">مفيش حركات مسجلة</td></tr>
            )}
            {rows.map((m) => {
              const cfg = typeLabel[m.type] || typeLabel.ADJUSTMENT;
              const itemName = m.product?.nameAr || m.product?.name || m.ingredient?.nameAr || m.ingredient?.name || '—';
              return (
                <tr key={m.id} className="border-t border-ink-100 hover:bg-ink-50">
                  <td className="p-3 text-xs text-ink-600 whitespace-nowrap">{new Date(m.createdAt).toLocaleString('ar-EG')}</td>
                  <td className="p-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold bg-${cfg.color}-100 text-${cfg.color}-700`}>
                      {cfg.icon} {cfg.label}
                    </span>
                  </td>
                  <td className="p-3 font-medium">{itemName}</td>
                  <td className={`p-3 font-bold ${m.type === 'IN' ? 'text-emerald-600' : m.type === 'OUT' ? 'text-amber-600' : 'text-blue-600'}`}>
                    {m.type === 'IN' ? '+' : m.type === 'OUT' ? '−' : ''}{m.quantity}
                  </td>
                  <td className="p-3 text-xs text-ink-500">{m.reason || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {hasMore && (
          <div className="p-3 border-t border-ink-200 text-center">
            <button onClick={() => load(false)} disabled={loadingMore} className="btn-ghost text-xs">
              <ChevronDown className="w-3 h-3" /> {loadingMore ? 'جاري التحميل...' : 'تحميل المزيد'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
