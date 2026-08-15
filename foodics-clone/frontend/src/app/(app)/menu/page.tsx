'use client';
import { useEffect, useState } from 'react';
import { api, formatSAR } from '@/lib/api';
import { toast } from '@/components/Toast';
import { ProductImage } from '@/components/ProductImage';
import { Plus, Edit2, Trash2, X, Search, Wheat, Layers, ListChecks, TrendingUp, TrendingDown, Ban, RotateCcw } from 'lucide-react';

export default function MenuPage() {
  const [categories, setCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<any>(null);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [recipeProduct, setRecipeProduct] = useState<any>(null);
  const [optionsProduct, setOptionsProduct] = useState<any>(null);

  useEffect(() => { load(); }, []);
  const load = async () => {
    const [c, p, i] = await Promise.all([api.get('/categories'), api.get('/products'), api.get('/ingredients')]);
    setCategories(c.data.categories);
    setProducts(p.data.products);
    setIngredients(i.data.ingredients);
  };

  const save = async (data: any) => {
    try {
      if (data.id) await api.put(`/products/${data.id}`, data);
      else await api.post('/products', data);
      setEditing(null); load();
    } catch (e: any) { toast.error(e.response?.data?.error || 'خطأ'); }
  };
  const del = async (id: string) => { if (!confirm('حذف المنتج؟')) return; try { await api.delete(`/products/${id}`); load(); } catch(e: any) { toast.error(e.response?.data?.error || 'فشل الحذف'); } };

  const saveCategory = async (data: any) => {
    try {
      if (data.id) await api.put(`/categories/${data.id}`, data);
      else await api.post('/categories', data);
      setEditingCategory(null); load();
    } catch (e: any) { toast.error(e.response?.data?.error || 'خطأ'); }
  };

  // F-D: temporary out-of-stock toggle. We send the timestamp to the server.
  // If the user picks "30 دقيقة", we set outOfStockUntil = now+30min.
  // If they pick "رجّعه متاح", we send null.
  const toggleOutOfStock = async (p: any, minutes: number | null) => {
    try {
      const outOfStockUntil = minutes == null ? null : new Date(Date.now() + minutes * 60 * 1000).toISOString();
      await api.put(`/products/${p.id}`, { outOfStockUntil });
      toast.success(
        minutes == null ? 'تم إرجاع المنتج' : `تم إخفاء ${p.nameAr || p.name} لمدة ${minutes < 60 ? minutes + ' دقيقة' : (minutes / 60) + ' ساعة'}`,
        minutes == null ? undefined : 'سيظهر تلقائياً بعد انتهاء المدة'
      );
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'فشل');
    }
  };

  const filtered = products.filter((p) => (p.nameAr || p.name || '').includes(search));

  // F-C: recipe margin summary
  const margins = products.map((p) => {
    const recipe = p.recipe || [];
    const recipeCost = recipe.reduce((s: number, r: any) => {
      const ing = ingredients.find((i) => i.id === r.ingredientId);
      return s + (ing ? Number(ing.cost) * Number(r.quantity) : 0);
    }, 0);
    const cost = recipeCost > 0 ? recipeCost : Number(p.cost || 0);
    const margin = Number(p.price) - cost;
    const marginPct = Number(p.price) > 0 ? (margin / Number(p.price)) * 100 : 0;
    return { id: p.id, nameAr: p.nameAr, name: p.name, price: Number(p.price), cost, margin, marginPct, hasRecipe: recipe.length > 0 };
  });
  const lowMargin = margins.filter((m) => m.marginPct < 30).length;
  const avgMargin = margins.length > 0 ? margins.reduce((s, m) => s + m.marginPct, 0) / margins.length : 0;

  return (
    <div className="p-6 lg:p-8 space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">إدارة القائمة</h1>
          <p className="text-ink-500 text-sm">{products.length} منتج في {categories.length} فئات</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setEditingCategory({})} className="btn-secondary text-sm"><Plus className="w-4 h-4" /> فئة</button>
          <button onClick={() => setEditing({})} className="btn-primary text-sm"><Plus className="w-4 h-4" /> منتج</button>
        </div>
      </div>

      {/* F-C: margin summary cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="card p-3 bg-emerald-50 border-emerald-200">
          <div className="text-xs text-ink-600">متوسط هامش الربح</div>
          <div className="text-2xl font-bold text-emerald-700">{avgMargin.toFixed(1)}%</div>
        </div>
        <div className="card p-3 bg-amber-50 border-amber-200">
          <div className="text-xs text-ink-600">منتجات بهامش أقل من 30%</div>
          <div className="text-2xl font-bold text-amber-700">{lowMargin}</div>
        </div>
        <div className="card p-3 bg-blue-50 border-blue-200">
          <div className="text-xs text-ink-600">منتجات بـ ريسبي</div>
          <div className="text-2xl font-bold text-blue-700">{margins.filter(m => m.hasRecipe).length}</div>
        </div>
      </div>

      <div className="card p-4">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث..." className="input pr-9" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((p) => {
          const m = margins.find((x) => x.id === p.id)!;
          const outOfStock = p.outOfStockUntil && new Date(p.outOfStockUntil).getTime() > Date.now();
          return (
            <div key={p.id} className="card p-4">
              <div className="flex items-start gap-3">
                <div className="w-14 h-14 flex items-center justify-center text-4xl shrink-0 overflow-hidden rounded-lg">
                  <ProductImage value={p.image} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0 text-right">
                  <div className="font-semibold">{p.nameAr || p.name}</div>
                  <div className="text-xs text-ink-500 mt-1">{p.category.nameAr || p.category.name}</div>
                  {p.barcode && <div className="text-[10px] text-ink-400 mt-0.5 font-mono">🔢 {p.barcode}</div>}
                </div>
              </div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-ink-100">
                <div>
                  <div className="text-lg font-bold text-brand-600">{formatSAR(p.price)}</div>
                  {/* F-C: margin indicator */}
                  {m.cost > 0 && (
                    <div className={`text-[10px] flex items-center gap-1 mt-0.5 ${m.marginPct >= 50 ? 'text-emerald-600' : m.marginPct >= 30 ? 'text-amber-600' : 'text-red-600'}`}>
                      {m.marginPct >= 30 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      هامش {m.marginPct.toFixed(0)}% ({formatSAR(m.margin)})
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-wrap justify-end">
                  {outOfStock ? (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 flex items-center gap-1">
                      <Ban className="w-3 h-3" /> مخفي مؤقتاً
                    </span>
                  ) : p.isAvailable ? (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">متاح</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">مخفي</span>
                  )}
                  {p.inventory && <span className="px-2 py-0.5 rounded-full text-xs bg-ink-100 text-ink-700">{p.inventory.stock} قطعة</span>}
                </div>
              </div>
              <div className="flex gap-1 mt-3 flex-wrap">
                <button onClick={() => setEditing(p)} className="btn-secondary text-xs flex-1"><Edit2 className="w-3 h-3" /> تعديل</button>
                <button onClick={() => setOptionsProduct(p)} className="btn-secondary text-xs flex-1 text-blue-600 relative" title="الأحجام والإضافات">
                  <Layers className="w-3 h-3" /> خيارات
                  {((p.variants?.length || 0) + (p.modifierGroups?.length || 0)) > 0 && (
                    <span className="absolute -top-1 -left-1 bg-blue-600 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center">
                      {(p.variants?.length || 0) + (p.modifierGroups?.length || 0)}
                    </span>
                  )}
                </button>
                <button onClick={() => setRecipeProduct(p)} className="btn-secondary text-xs flex-1 text-purple-600"><Wheat className="w-3 h-3" /> ريسبي</button>
                {/* F-D: out-of-stock quick toggle */}
                {!outOfStock ? (
                  <button
                    onClick={() => toggleOutOfStock(p, 30)}
                    className="btn-secondary text-xs text-amber-600"
                    title="إخفاء من الـ POS لمدة 30 دقيقة"
                  >
                    <Ban className="w-3 h-3" />
                  </button>
                ) : (
                  <button
                    onClick={() => toggleOutOfStock(p, null)}
                    className="btn-secondary text-xs text-emerald-600"
                    title="إرجاع المنتج للـ POS"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                )}
                <button onClick={() => del(p.id)} className="btn-secondary text-xs text-red-600"><Trash2 className="w-3 h-3" /></button>
              </div>
            </div>
          );
        })}
      </div>

      {editing && <ProductForm product={editing} categories={categories} onClose={() => setEditing(null)} onSave={save} />}
      {editingCategory && <CategoryForm category={editingCategory} onClose={() => setEditingCategory(null)} onSave={saveCategory} categories={categories} />}
      {recipeProduct && <RecipeForm product={recipeProduct} ingredients={ingredients} onClose={() => setRecipeProduct(null)} />}
      {optionsProduct && <ProductOptionsForm product={optionsProduct} onClose={() => { setOptionsProduct(null); load(); }} />}
    </div>
  );
}

function ProductForm({ product, categories, onClose, onSave }: any) {
  const [form, setForm] = useState<any>({
    id: product.id, name: product.name || '', nameAr: product.nameAr || '',
    description: product.description || '', image: product.image || '🍔',
    price: product.price || 0, cost: product.cost || 0, sku: product.sku || '',
    categoryId: product.categoryId || categories[0]?.id || '',
    isActive: product.isActive !== false, isAvailable: product.isAvailable !== false,
  });
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">{product.id ? 'تعديل' : 'إضافة'} منتج</h3>
          <button onClick={onClose} className="p-1 hover:bg-ink-100 rounded"><X className="w-4 h-4" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><label className="text-sm font-medium">الاسم بالعربي</label><input className="input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} /></div>
          <div className="col-span-2"><label className="text-sm font-medium">الاسم بالإنجليزي</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="col-span-2"><label className="text-sm font-medium">الوصف</label><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div><label className="text-sm font-medium">السعر (جنيه)</label><input type="number" step="0.01" className="input" value={form.price} onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value) || 0 })} /></div>
          <div><label className="text-sm font-medium">التكلفة (جنيه)</label><input type="number" step="0.01" className="input" value={form.cost} onChange={(e) => setForm({ ...form, cost: parseFloat(e.target.value) || 0 })} /></div>
          <div><label className="text-sm font-medium">الفئة</label>
            <select className="input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              {categories.map((c: any) => <option key={c.id} value={c.id}>{c.nameAr || c.name}</option>)}
            </select>
          </div>
          <div><label className="text-sm font-medium">الإيموجي</label><input className="input" value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} /></div>
          <div className="col-span-2 flex gap-3">
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> نشط</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.isAvailable} onChange={(e) => setForm({ ...form, isAvailable: e.target.checked })} /> متاح</label>
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

function CategoryForm({ category, categories, onClose, onSave }: any) {
  const [form, setForm] = useState<any>({
    id: category.id, name: category.name || '', nameAr: category.nameAr || '',
    image: category.image || '🍽️', sortOrder: category.sortOrder || 0,
    isActive: category.isActive !== false,
  });
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">{category.id ? 'تعديل' : 'إضافة'} فئة</h3>
          <button onClick={onClose} className="p-1 hover:bg-ink-100 rounded"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <div><label className="text-sm font-medium">الاسم بالعربي</label><input className="input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} /></div>
          <div><label className="text-sm font-medium">الاسم بالإنجليزي</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="text-sm font-medium">الإيموجي</label><input className="input" value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} /></div>
        </div>
        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className="btn-secondary flex-1">إلغاء</button>
          <button onClick={() => onSave(form)} className="btn-primary flex-1">حفظ</button>
        </div>
      </div>
    </div>
  );
}

function RecipeForm({ product, ingredients, onClose }: any) {
  const [recipe, setRecipe] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/products/${product.id}/recipe`).then((r) => {
      setRecipe(r.data.recipe.map((r: any) => ({ ingredientId: r.ingredientId, quantity: r.quantity, ingredient: r.ingredient })));
      setLoading(false);
    });
  }, [product.id]);

  const update = (ingId: string, qty: number) => {
    setRecipe((prev) => {
      const existing = prev.find((r) => r.ingredientId === ingId);
      if (qty <= 0) return prev.filter((r) => r.ingredientId !== ingId);
      if (existing) return prev.map((r) => r.ingredientId === ingId ? { ...r, quantity: qty } : r);
      return [...prev, { ingredientId: ingId, quantity: qty, ingredient: ingredients.find((i: any) => i.id === ingId) }];
    });
  };

  const save = async () => {
    await api.post(`/products/${product.id}/recipe`, {
      items: recipe.map((r) => ({ ingredientId: r.ingredientId, quantity: r.quantity })),
    });
    alert('✅ تم حفظ الريسبي');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg flex items-center gap-2"><Wheat className="w-5 h-5 text-purple-600" /> ريسبي: {product.nameAr || product.name}</h3>
          <button onClick={onClose} className="p-1 hover:bg-ink-100 rounded"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-sm text-ink-500 mb-4">حدد المكونات اللي بتدخل في كل قطعة من المنتج، عشان تتخصم تلقائياً من المخزون عند البيع</p>
        {loading ? <div>جاري التحميل...</div> : (
          <div className="space-y-2">
            {ingredients.map((ing: any) => {
              const r = recipe.find((x) => x.ingredientId === ing.id);
              return (
                <div key={ing.id} className="flex items-center gap-2 p-2 bg-ink-50 rounded">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{ing.nameAr || ing.name}</div>
                    <div className="text-xs text-ink-500">متاح: {ing.stock} {ing.unit}</div>
                  </div>
                  <input type="number" step="0.01" placeholder="الكمية" className="w-20 text-sm" defaultValue={r?.quantity || 0}
                    onChange={(e) => update(ing.id, parseFloat(e.target.value) || 0)} />
                  <span className="text-xs text-ink-500 w-8">{ing.unit}</span>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className="btn-secondary flex-1">إلغاء</button>
          <button onClick={save} className="btn-primary flex-1">حفظ الريسبي</button>
        </div>
      </div>
    </div>
  );
}

function ProductOptionsForm({ product, onClose }: { product: any; onClose: () => void }) {
  const [tab, setTab] = useState<'variants' | 'modifiers'>('variants');
  const [variants, setVariants] = useState<any[]>(product.variants || []);
  const [modGroups, setModGroups] = useState<any[]>(product.modifierGroups || []);

  const addVariant = async () => {
    try {
      const r = await api.post(`/products/${product.id}/variants`, {
        label: 'حجم جديد', labelAr: 'حجم جديد', price: 0, sortOrder: variants.length,
      });
      setVariants([...variants, r.data.variant]);
    } catch (e: any) { alert(e.response?.data?.error || 'خطأ'); }
  };
  const updateVariant = async (id: string, patch: any) => {
    setVariants((vs) => vs.map((v) => v.id === id ? { ...v, ...patch } : v));
    try { await api.put(`/variants/${id}`, patch); } catch {}
  };
  const removeVariant = async (id: string) => {
    if (!confirm('حذف الحجم؟')) return;
    try { await api.delete(`/variants/${id}`); setVariants((vs) => vs.filter((v) => v.id !== id)); } catch (e: any) { alert('خطأ'); }
  };

  const addGroup = async () => {
    try {
      const r = await api.post(`/products/${product.id}/modifier-groups`, {
        name: 'New Group', nameAr: 'مجموعة جديدة', type: 'SINGLE', required: false, minSelect: 0, maxSelect: 1, sortOrder: modGroups.length,
      });
      setModGroups([...modGroups, { ...r.data.group, options: [] }]);
    } catch (e: any) { alert(e.response?.data?.error || 'خطأ'); }
  };
  const updateGroup = async (id: string, patch: any) => {
    setModGroups((gs) => gs.map((g) => g.id === id ? { ...g, ...patch } : g));
    try { await api.put(`/modifier-groups/${id}`, patch); } catch {}
  };
  const removeGroup = async (id: string) => {
    if (!confirm('حذف المجموعة وكل الخيارات؟')) return;
    try { await api.delete(`/modifier-groups/${id}`); setModGroups((gs) => gs.filter((g) => g.id !== id)); } catch {}
  };

  const addOption = async (groupId: string) => {
    try {
      const r = await api.post(`/modifier-groups/${groupId}/options`, {
        label: 'Option', labelAr: 'خيار', priceDelta: 0, sortOrder: 99,
      });
      setModGroups((gs) => gs.map((g) => g.id === groupId ? { ...g, options: [...(g.options || []), r.data.option] } : g));
    } catch (e: any) { alert(e.response?.data?.error || 'خطأ'); }
  };
  const updateOption = async (groupId: string, id: string, patch: any) => {
    setModGroups((gs) => gs.map((g) => g.id === groupId ? { ...g, options: g.options.map((o: any) => o.id === id ? { ...o, ...patch } : o) } : g));
    try { await api.put(`/modifier-options/${id}`, patch); } catch {}
  };
  const removeOption = async (groupId: string, id: string) => {
    if (!confirm('حذف الخيار؟')) return;
    try { await api.delete(`/modifier-options/${id}`); setModGroups((gs) => gs.map((g) => g.id === groupId ? { ...g, options: g.options.filter((o: any) => o.id !== id) } : g)); } catch {}
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-ink-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center text-2xl shrink-0 overflow-hidden rounded-lg">
              <ProductImage value={product.image} className="w-full h-full object-cover" />
            </div>
            <div>
              <div className="font-bold text-lg">خيارات: {product.nameAr || product.name}</div>
              <div className="text-xs text-ink-500">الأحجام والإضافات الاختيارية</div>
            </div>
          </div>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>

        <div className="flex border-b border-ink-200">
          <button onClick={() => setTab('variants')} className={`flex-1 px-4 py-3 text-sm font-bold flex items-center justify-center gap-2 ${tab === 'variants' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-ink-500'}`}>
            <Layers className="w-4 h-4" /> الأحجام ({variants.length})
          </button>
          <button onClick={() => setTab('modifiers')} className={`flex-1 px-4 py-3 text-sm font-bold flex items-center justify-center gap-2 ${tab === 'modifiers' ? 'border-b-2 border-amber-600 text-amber-600' : 'text-ink-500'}`}>
            <ListChecks className="w-4 h-4" /> الإضافات ({modGroups.length})
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {tab === 'variants' && (
            <>
              <p className="text-sm text-ink-500">أحجام الصنف (3 قطع / 5 قطع / كيلو...). لازم يختار الكاشير حجم قبل الإضافة.</p>
              {variants.map((v) => (
                <div key={v.id} className="grid grid-cols-12 gap-2 items-center p-2 bg-ink-50 rounded-lg">
                  <input className="input col-span-3 text-right" value={v.labelAr || v.label} onChange={(e) => updateVariant(v.id, { labelAr: e.target.value, label: e.target.value })} placeholder="اسم الحجم" />
                  <input className="input col-span-3 text-right" value={v.label || ''} onChange={(e) => updateVariant(v.id, { label: e.target.value })} placeholder="English label" />
                  <input type="number" step="0.01" className="input col-span-3 text-right" value={v.price} onChange={(e) => updateVariant(v.id, { price: parseFloat(e.target.value) || 0 })} placeholder="السعر" />
                  <input type="number" className="input col-span-2 text-center" value={v.sortOrder} onChange={(e) => updateVariant(v.id, { sortOrder: parseInt(e.target.value) || 0 })} placeholder="ترتيب" />
                  <button onClick={() => removeVariant(v.id)} className="col-span-1 p-2 text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
              <button onClick={addVariant} className="btn-secondary w-full"><Plus className="w-4 h-4" /> إضافة حجم</button>
            </>
          )}

          {tab === 'modifiers' && (
            <>
              <p className="text-sm text-ink-500">إضافات اختيارية على الصنف (نوع العيش، الصوصات، جبنة زيادة...).</p>
              {modGroups.map((g) => (
                <div key={g.id} className="border border-ink-200 rounded-lg p-3 space-y-2">
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <input className="input col-span-3 text-right" value={g.nameAr || g.name} onChange={(e) => updateGroup(g.id, { nameAr: e.target.value, name: e.target.value })} placeholder="اسم المجموعة" />
                    <select className="input col-span-2" value={g.type} onChange={(e) => updateGroup(g.id, { type: e.target.value, maxSelect: e.target.value === 'SINGLE' ? 1 : (g.maxSelect || 3) })}>
                      <option value="SINGLE">اختيار واحد</option>
                      <option value="MULTI">اختيار متعدد</option>
                    </select>
                    <label className="col-span-2 flex items-center gap-1 text-xs"><input type="checkbox" checked={!!g.required} onChange={(e) => updateGroup(g.id, { required: e.target.checked, minSelect: e.target.checked ? 1 : 0 })} /> مطلوب</label>
                    <input type="number" className="input col-span-1 text-center" value={g.minSelect || 0} onChange={(e) => updateGroup(g.id, { minSelect: parseInt(e.target.value) || 0 })} placeholder="أقل" />
                    <input type="number" className="input col-span-1 text-center" value={g.maxSelect || 1} onChange={(e) => updateGroup(g.id, { maxSelect: parseInt(e.target.value) || 1 })} placeholder="أقصى" />
                    <input type="number" className="input col-span-1 text-center" value={g.sortOrder} onChange={(e) => updateGroup(g.id, { sortOrder: parseInt(e.target.value) || 0 })} placeholder="ترتيب" />
                    <button onClick={() => removeGroup(g.id)} className="col-span-2 p-2 text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  <div className="space-y-1 pl-4 border-r-2 border-amber-300 mr-2">
                    {(g.options || []).map((o: any) => (
                      <div key={o.id} className="grid grid-cols-12 gap-2 items-center text-sm">
                        <input className="input col-span-4 text-right" value={o.labelAr || o.label} onChange={(e) => updateOption(g.id, o.id, { labelAr: e.target.value, label: e.target.value })} placeholder="اسم الخيار" />
                        <input className="input col-span-3 text-right" value={o.label || ''} onChange={(e) => updateOption(g.id, o.id, { label: e.target.value })} placeholder="English" />
                        <input type="number" step="0.01" className="input col-span-2 text-right" value={o.priceDelta} onChange={(e) => updateOption(g.id, o.id, { priceDelta: parseFloat(e.target.value) || 0 })} placeholder="فرق السعر" />
                        <label className="col-span-1 flex items-center gap-1 text-xs"><input type="checkbox" checked={!!o.isDefault} onChange={(e) => updateOption(g.id, o.id, { isDefault: e.target.checked })} /> افتراضي</label>
                        <input type="number" className="input col-span-1 text-center" value={o.sortOrder} onChange={(e) => updateOption(g.id, o.id, { sortOrder: parseInt(e.target.value) || 0 })} />
                        <button onClick={() => removeOption(g.id, o.id)} className="col-span-1 p-1.5 text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    ))}
                    <button onClick={() => addOption(g.id)} className="text-xs text-blue-600 hover:underline">+ خيار</button>
                  </div>
                </div>
              ))}
              <button onClick={addGroup} className="btn-secondary w-full"><Plus className="w-4 h-4" /> إضافة مجموعة</button>
            </>
          )}
        </div>

        <div className="p-4 border-t border-ink-200 bg-ink-50 text-left">
          <button onClick={onClose} className="btn-primary">تم</button>
        </div>
      </div>
    </div>
  );
}
