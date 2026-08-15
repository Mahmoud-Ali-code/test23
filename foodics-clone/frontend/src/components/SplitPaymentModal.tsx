'use client';
import { useState, useMemo, useEffect } from 'react';
import { X, Plus, Trash2, Check, Banknote, CreditCard, Smartphone, Wallet, Heart } from 'lucide-react';
import { formatSAR } from '@/lib/api';

export type PaymentMethod = 'CASH' | 'CARD' | 'INSTAPAY';

export interface PaymentLine {
  method: PaymentMethod;
  amount: number;
  /** F-E: optional tip portion of this line. Defaults to 0. */
  tip?: number;
}

interface Props {
  open: boolean;
  total: number;
  onClose: () => void;
  onSubmit: (lines: PaymentLine[], tip: number) => Promise<void> | void;
}

const METHOD_LABELS: Record<PaymentMethod, { label: string; icon: any; color: string }> = {
  CASH:    { label: 'كاش',    icon: Banknote,   color: 'emerald' },
  CARD:    { label: 'فيزا',   icon: CreditCard, color: 'blue' },
  INSTAPAY: { label: 'إنستاباي', icon: Smartphone, color: 'purple' },
};

export default function SplitPaymentModal({ open, total, onClose, onSubmit }: Props) {
  const [lines, setLines] = useState<PaymentLine[]>([{ method: 'CASH', amount: total, tip: 0 }]);
  const [tip, setTip] = useState<number>(0); // F-E: total tip across all lines
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset to one full-cash line whenever the modal opens
  useEffect(() => {
    if (open) {
      setLines([{ method: 'CASH', amount: total, tip: 0 }]);
      setTip(0);
      setError(null);
    }
  }, [open, total]);

  const paid = useMemo(() => round2(lines.reduce((s, l) => s + (Number(l.amount) || 0), 0)), [lines]);
  // F-E: amount required to cover the order total is `total + tip` (tip is on top, not in total).
  // We validate the user is paying at least `total` (without tip) in the lines.
  const remaining = useMemo(() => round2(total - paid), [total, paid]);
  const overpaid = remaining < -0.001;
  const grandTotal = useMemo(() => round2(total + tip), [total, tip]);

  function round2(n: number) { return Math.round((n + Number.EPSILON) * 100) / 100; }

  const updateLine = (idx: number, patch: Partial<PaymentLine>) => {
    setLines((prev) => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));
  };
  const addLine = () => {
    const rem = Math.max(0, round2(total - paid));
    setLines((prev) => [...prev, { method: 'CARD', amount: rem, tip: 0 }]);
  };
  const removeLine = (idx: number) => {
    if (lines.length === 1) return; // keep at least one
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const fillRemaining = (idx: number) => {
    const other = lines.reduce((s, l, i) => i === idx ? s : s + (Number(l.amount) || 0), 0);
    updateLine(idx, { amount: Math.max(0, round2(total - other)) });
  };

  const handleSubmit = async () => {
    setError(null);
    if (lines.length === 0) return setError('لازم تضيف طريقة دفع واحدة على الأقل');
    for (const l of lines) {
      if (!l.method) return setError('اختار طريقة الدفع');
      if (!Number.isFinite(Number(l.amount)) || Number(l.amount) <= 0) return setError('قيمة الدفعة لازم تكون أكبر من صفر');
    }
    if (overpaid) return setError(`المدفوع أكبر من المطلوب بـ ${formatSAR(-remaining)}`);
    if (paid < total - 0.001) return setError(`المتبقي ${formatSAR(remaining)} — زود الدفعات أو ادفع الباقي`);
    if (tip < 0) return setError('البقشيش مش ممكن يكون سالب');

    setSubmitting(true);
    try {
      await onSubmit(lines, tip);
    } catch (e: any) {
      const msg =
        e?.response?.data?.error ||
        (typeof e?.message === 'string' ? e.message : null) ||
        'فشل إتمام الدفع';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Quick tip suggestions (percent of subtotal)
  const setTipPct = (pct: number) => {
    setTip(round2(total * pct));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" dir="rtl" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="p-4 border-b border-ink-200 flex items-center justify-between bg-gradient-to-l from-brand-50 to-white">
          <div>
            <div className="font-bold text-lg">دفع متعدد</div>
            <div className="text-xs text-ink-500">قسّم الفاتورة على أكثر من طريقة دفع</div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-ink-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        {/* Summary */}
        <div className="p-4 grid grid-cols-4 gap-2 border-b border-ink-200 bg-ink-50">
          <div>
            <div className="text-[10px] text-ink-500 uppercase tracking-wider">الإجمالي</div>
            <div className="text-base font-bold text-brand-600">{formatSAR(total)}</div>
          </div>
          <div>
            <div className="text-[10px] text-ink-500 uppercase tracking-wider">المدفوع</div>
            <div className="text-base font-bold text-emerald-600">{formatSAR(paid)}</div>
          </div>
          <div>
            <div className="text-[10px] text-ink-500 uppercase tracking-wider">المتبقي</div>
            <div className={`text-base font-bold ${remaining > 0.001 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {formatSAR(Math.max(0, remaining))}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-ink-500 uppercase tracking-wider">المجموع + بقشيش</div>
            <div className="text-base font-bold text-purple-600">{formatSAR(grandTotal)}</div>
          </div>
        </div>

        {/* Lines */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {lines.map((l, idx) => {
            const cfg = METHOD_LABELS[l.method];
            const Icon = cfg.icon;
            return (
              <div key={idx} className="flex items-center gap-2 p-2 bg-white border border-ink-200 rounded-lg">
                <div className={`p-2 rounded-lg bg-${cfg.color}-100 text-${cfg.color}-700`}>
                  <Icon className="w-4 h-4" />
                </div>
                <select
                  value={l.method}
                  onChange={(e) => updateLine(idx, { method: e.target.value as PaymentMethod })}
                  className="input flex-1"
                >
                  {(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((m) => (
                    <option key={m} value={m}>{METHOD_LABELS[m].label}</option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={l.amount}
                  onChange={(e) => updateLine(idx, { amount: parseFloat(e.target.value) || 0 })}
                  className="input w-32 text-left"
                  placeholder="قيمة"
                />
                <button
                  type="button"
                  onClick={() => fillRemaining(idx)}
                  className="text-[10px] text-brand-600 hover:underline whitespace-nowrap"
                  title="تعبئة بالمتبقي"
                >
                  المتبقي
                </button>
                {lines.length > 1 && (
                  <button onClick={() => removeLine(idx)} className="p-2 text-red-600 hover:bg-red-50 rounded">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
          <button onClick={addLine} className="btn-secondary w-full">
            <Plus className="w-4 h-4" /> إضافة طريقة دفع
          </button>

          {/* F-E: Tip row */}
          <div className="mt-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Heart className="w-4 h-4 text-purple-600" />
              <span className="font-semibold text-purple-900 text-sm">بقشيش (اختياري)</span>
              <span className="text-[10px] text-purple-600 mr-auto">يذهب للكاشير، لا يدخل في إيرادات المطعم</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                min="0"
                value={tip || ''}
                onChange={(e) => setTip(parseFloat(e.target.value) || 0)}
                className="input flex-1 text-left"
                placeholder="0.00"
              />
              <span className="text-xs text-purple-700 whitespace-nowrap">جنيه</span>
            </div>
            <div className="flex gap-1 mt-2">
              {[0, 0.05, 0.10, 0.15].map((pct) => (
                <button
                  key={pct}
                  onClick={() => setTipPct(pct)}
                  className="flex-1 text-[11px] py-1 px-2 bg-white border border-purple-200 rounded hover:bg-purple-100 text-purple-700"
                >
                  {pct === 0 ? 'بدون' : `${(pct * 100).toFixed(0)}%`}
                </button>
              ))}
            </div>
          </div>

          {error && <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg p-3 text-sm">{error}</div>}

          {/* Visual bar */}
          <div className="pt-2">
            <div className="h-3 bg-ink-100 rounded-full overflow-hidden flex">
              {lines.map((l, idx) => {
                const pct = total > 0 ? Math.min(100, (Number(l.amount) || 0) / total * 100) : 0;
                const cfg = METHOD_LABELS[l.method];
                const colorMap: Record<string, string> = { emerald: 'bg-emerald-500', blue: 'bg-blue-500', purple: 'bg-purple-500' };
                return (
                  <div key={idx} className={`${colorMap[cfg.color]} h-full`} style={{ width: `${pct}%` }} title={`${cfg.label}: ${formatSAR(Number(l.amount) || 0)}`} />
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-ink-200 bg-ink-50 flex items-center gap-2 justify-end">
          <button onClick={onClose} className="btn-secondary">إلغاء</button>
          <button
            onClick={handleSubmit}
            disabled={submitting || paid < total - 0.001}
            className="btn-primary"
          >
            <Check className="w-4 h-4" /> {submitting ? 'جاري التنفيذ...' : 'تنفيذ الدفع'}
          </button>
        </div>
      </div>
    </div>
  );
}
