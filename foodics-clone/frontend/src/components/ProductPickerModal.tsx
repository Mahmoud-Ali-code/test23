'use client';
import { useEffect, useState, useMemo } from 'react';
import { X, Check } from 'lucide-react';
import { ProductImage } from '@/components/ProductImage';

export interface Variant {
  id: string;
  label: string;
  labelAr?: string | null;
  price: number;
  sortOrder?: number;
  isActive?: boolean;
}

export interface ModifierOption {
  id: string;
  groupId: string;
  label: string;
  labelAr?: string | null;
  priceDelta: number;
  isDefault?: boolean;
  sortOrder?: number;
}

export interface ModifierGroup {
  id: string;
  name: string;
  nameAr?: string | null;
  type: 'SINGLE' | 'MULTI';
  required: boolean;
  minSelect: number;
  maxSelect: number;
  options: ModifierOption[];
}

export interface SelectedModifier {
  optionId: string;
  groupId: string;
  groupName: string;
  optionLabel: string;
  priceDelta: number;
}

interface Props {
  open: boolean;
  product: {
    id: string;
    name: string;
    nameAr?: string;
    image?: string;
    price: number;
    variants?: Variant[];
    modifierGroups?: ModifierGroup[];
  } | null;
  onClose: () => void;
  onAdd: (selection: {
    productId: string;
    variantId?: string;
    variantLabel?: string;
    modifiers: SelectedModifier[];
    finalPrice: number;
    quantity: number;
  }) => void;
}

export default function ProductPickerModal({ open, product, onClose, onAdd }: Props) {
  const [variantId, setVariantId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, Set<string>>>({}); // groupId -> Set<optionId>
  const [qty, setQty] = useState(1);
  const [error, setError] = useState<string | null>(null);

  // Reset on product change
  useEffect(() => {
    if (!product || !open) return;
    setQty(1);
    setError(null);
    // Default variant: first one if no required, else null
    setVariantId(product.variants && product.variants.length > 0 ? product.variants[0].id : null);
    // Default modifier selections (isDefault)
    const init: Record<string, Set<string>> = {};
    for (const g of product.modifierGroups || []) {
      const s = new Set<string>();
      for (const o of g.options) {
        if (o.isDefault) s.add(o.id);
      }
      if (s.size > 0) init[g.id] = s;
    }
    setSelected(init);
  }, [product, open]);

  const unitPrice = useMemo(() => {
    if (!product) return 0;
    let base = product.price;
    if (variantId) {
      const v = product.variants?.find((x) => x.id === variantId);
      if (v) base = v.price;
    }
    // Add modifier priceDeltas
    for (const g of product.modifierGroups || []) {
      const sel = selected[g.id] || new Set<string>();
      for (const oid of sel) {
        const o = g.options.find((x) => x.id === oid);
        if (o) base += o.priceDelta;
      }
    }
    return Math.max(0, Math.round(base * 100) / 100);
  }, [product, variantId, selected]);

  if (!open || !product) return null;

  const hasVariants = (product.variants?.length || 0) > 0;
  const groups = product.modifierGroups || [];

  const toggleOption = (g: ModifierGroup, oid: string) => {
    setError(null);
    setSelected((prev) => {
      const cur = new Set(prev[g.id] || []);
      if (g.type === 'SINGLE') {
        if (cur.has(oid)) {
          // allow deselect only if not required + min=0
          if (g.required || g.minSelect > 0) return prev;
          cur.delete(oid);
        } else {
          cur.clear();
          cur.add(oid);
        }
      } else {
        if (cur.has(oid)) {
          if (cur.size > g.minSelect) cur.delete(oid);
        } else {
          if (cur.size >= g.maxSelect) return prev; // capped
          cur.add(oid);
        }
      }
      return { ...prev, [g.id]: cur };
    });
  };

  const validate = (): string | null => {
    if (hasVariants && !variantId) return 'برجاء اختيار الحجم';
    for (const g of groups) {
      const sel = (selected[g.id] || new Set()).size;
      if (g.required && sel < 1) return `برجاء اختيار ${g.nameAr || g.name}`;
      if (g.minSelect > 0 && sel < g.minSelect) return `اختار على الأقل ${g.minSelect} من ${g.nameAr || g.name}`;
      if (sel > g.maxSelect) return `الحد الأقصى ${g.maxSelect} من ${g.nameAr || g.name}`;
    }
    return null;
  };

  const handleAdd = () => {
    const err = validate();
    if (err) { setError(err); return; }
    const flat: SelectedModifier[] = [];
    for (const g of groups) {
      const sel = selected[g.id] || new Set<string>();
      for (const oid of sel) {
        const o = g.options.find((x) => x.id === oid);
        if (o) flat.push({
          optionId: o.id, groupId: g.id, groupName: g.nameAr || g.name,
          optionLabel: o.labelAr || o.label, priceDelta: o.priceDelta,
        });
      }
    }
    const variant = hasVariants ? product.variants?.find((v) => v.id === variantId) : null;
    onAdd({
      productId: product.id,
      variantId: variant?.id,
      variantLabel: variant ? (variant.labelAr || variant.label) : undefined,
      modifiers: flat,
      finalPrice: unitPrice,
      quantity: qty,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" dir="rtl" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="p-4 border-b border-ink-200 flex items-center gap-3 bg-gradient-to-l from-brand-50 to-white">
          <div className="w-12 h-12 flex items-center justify-center text-3xl shrink-0 overflow-hidden rounded-lg">
            <ProductImage value={product.image} className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-lg truncate">{product.nameAr || product.name}</div>
            <div className="text-sm text-ink-500">اختر الإضافات وأضف للسلة</div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-ink-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Variants */}
          {hasVariants && (
            <div>
              <div className="text-sm font-bold text-ink-700 mb-2">الحجم</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {product.variants!.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setVariantId(v.id)}
                    className={`p-3 rounded-xl border-2 text-right transition ${
                      variantId === v.id
                        ? 'border-brand-600 bg-brand-50 shadow-sm'
                        : 'border-ink-200 hover:border-brand-300'
                    }`}
                  >
                    <div className="font-bold text-sm">{v.labelAr || v.label}</div>
                    <div className="text-brand-600 font-bold text-sm mt-1">{v.price} ج.م</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Modifier groups */}
          {groups.map((g) => (
            <div key={g.id}>
              <div className="flex items-center gap-2 mb-2">
                <div className="text-sm font-bold text-ink-700">{g.nameAr || g.name}</div>
                {g.required && <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full">مطلوب</span>}
                {g.type === 'MULTI' && (
                  <span className="text-[10px] bg-ink-100 text-ink-600 px-2 py-0.5 rounded-full">
                    {g.maxSelect > 1 ? `حتى ${g.maxSelect}` : 'اختيار واحد'}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {g.options.map((o) => {
                  const sel = (selected[g.id] || new Set()).has(o.id);
                  return (
                    <button
                      key={o.id}
                      onClick={() => toggleOption(g, o.id)}
                      className={`p-3 rounded-xl border-2 text-right flex items-center gap-2 transition ${
                        sel
                          ? 'border-brand-600 bg-brand-50'
                          : 'border-ink-200 hover:border-brand-300'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-${g.type === 'SINGLE' ? 'full' : 'md'} border-2 flex items-center justify-center flex-shrink-0 ${sel ? 'bg-brand-600 border-brand-600' : 'border-ink-300'}`}>
                        {sel && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm">{o.labelAr || o.label}</div>
                        <div className={`text-xs ${o.priceDelta > 0 ? 'text-brand-600' : o.priceDelta < 0 ? 'text-emerald-600' : 'text-ink-400'}`}>
                          {o.priceDelta > 0 ? `+${o.priceDelta}` : o.priceDelta < 0 ? `${o.priceDelta}` : 'بدون فرق'}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {error && <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg p-3 text-sm">{error}</div>}

          {/* Quantity */}
          <div className="flex items-center justify-between border-t border-ink-200 pt-4">
            <div className="text-sm font-bold text-ink-700">الكمية</div>
            <div className="flex items-center gap-3">
              <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="w-9 h-9 rounded-lg bg-ink-100 hover:bg-ink-200 font-bold">−</button>
              <div className="w-10 text-center font-bold text-lg">{qty}</div>
              <button onClick={() => setQty((q) => q + 1)} className="w-9 h-9 rounded-lg bg-ink-100 hover:bg-ink-200 font-bold">+</button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-ink-200 bg-ink-50 flex items-center gap-3">
          <div className="flex-1">
            <div className="text-xs text-ink-500">السعر الإجمالي</div>
            <div className="text-2xl font-bold text-brand-600">{(unitPrice * qty).toFixed(2)} ج.م</div>
          </div>
          <button onClick={onClose} className="btn-secondary">إلغاء</button>
          <button onClick={handleAdd} className="btn-primary">أضف للسلة</button>
        </div>
      </div>
    </div>
  );
}
