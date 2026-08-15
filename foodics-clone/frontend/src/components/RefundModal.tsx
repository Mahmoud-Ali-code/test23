'use client';
import { useState, useEffect, useMemo } from 'react';
import { X, Undo2, AlertCircle, Banknote, CreditCard, Smartphone, Wallet } from 'lucide-react';
import { api, formatSAR } from '@/lib/api';

export type PaymentMethod = 'CASH' | 'CARD' | 'INSTAPAY' | 'STORE_CREDIT';

interface Payment {
  id: string;
  method: string;
  amount: number;
  refundedAt: string | null;
  refundReason: string | null;
  createdAt: string;
  // Optional fields from the new /payments endpoint
  remaining?: number;
}

interface Props {
  open: boolean;
  orderId: string | null;
  orderNumber: string | null;
  orderTotal: number;
  onClose: () => void;
  /** Called after a successful refund so the parent can refresh */
  onRefunded?: () => void;
}

const METHOD_LABELS: Record<string, { label: string; icon: any; color: string }> = {
  CASH: { label: 'كاش', icon: Banknote, color: 'emerald' },
  CARD: { label: 'بطاقة', icon: CreditCard, color: 'blue' },
  INSTAPAY: { label: 'إنستاباي', icon: Smartphone, color: 'purple' },
  STORE_CREDIT: { label: 'رصيد متجر', icon: Wallet, color: 'amber' },
};

const REFUND_REASONS = [
  'إلغاء أوردر',
  'خطأ في الطلب',
  'شكوى عميل',
  'صنف غير متوفر',
  'استرداد جزئي',
  'أخرى',
];

/**
 * Modal for refunding one or more payments on an order.
 *
 * The cashier:
 *  1. Sees the order's payments (only the not-yet-refunded ones are selectable)
 *  2. Picks one (and the max amount is capped to the remaining refundable on that payment)
 *  3. Picks a refund method (CASH or STORE_CREDIT for in-store)
 *  4. Picks a reason
 *  5. Submits → POST /orders/:id/refunds
 */
export default function RefundModal({ open, orderId, orderNumber, orderTotal, onClose, onRefunded }: Props) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [amount, setAmount] = useState<string>('');
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>('CASH');
  const [reason, setReason] = useState<string>(REFUND_REASONS[0]);
  const [customReason, setCustomReason] = useState<string>('');
  const [reference, setReference] = useState<string>('');
  // P1.1: when the backend says "needs manager approval", we show a PIN field
  const [requiresManager, setRequiresManager] = useState(false);
  const [managerPin, setManagerPin] = useState<string>('');
  const [managerLimit, setManagerLimit] = useState<number | null>(null);

  // Load payments when the modal opens
  useEffect(() => {
    if (!open || !orderId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get(`/orders/${orderId}/payments`)
      .then((r) => {
        if (cancelled) return;
        setPayments(r.data.payments || []);
        // Auto-select the first unrefunded payment
        const first = (r.data.payments || []).find((p: Payment) => !p.refundedAt);
        if (first) {
          setSelectedPaymentId(first.id);
          setAmount(String(first.remaining ?? first.amount));
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.response?.data?.error || e?.message || 'فشل تحميل الدفعات');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, orderId]);

  // Reset when modal closes
  useEffect(() => {
    if (!open) {
      setSelectedPaymentId(null);
      setAmount('');
      setRefundMethod('CASH');
      setReason(REFUND_REASONS[0]);
      setCustomReason('');
      setReference('');
      setError(null);
      setRequiresManager(false);
      setManagerPin('');
      setManagerLimit(null);
    }
  }, [open]);

  const selectedPayment = useMemo(
    () => payments.find((p) => p.id === selectedPaymentId) || null,
    [payments, selectedPaymentId],
  );

  const maxAmount = selectedPayment ? (selectedPayment.remaining ?? selectedPayment.amount) : 0;
  const amountNum = Number(amount) || 0;
  const overAmount = amountNum > maxAmount;
  const underAmount = amountNum <= 0;
  const valid = !!selectedPayment && !overAmount && !underAmount && (reason !== 'أخرى' || customReason.trim());

  const submit = async () => {
    if (!orderId || !selectedPayment) return;
    setSubmitting(true);
    setError(null);
    try {
      const finalReason = reason === 'أخرى' ? customReason.trim() : reason;
      const payload: any = {
        paymentId: selectedPayment.id,
        amount: amountNum,
        method: refundMethod,
        reason: finalReason,
        reference: reference || undefined,
      };
      if (requiresManager && managerPin) payload.managerPin = managerPin;
      const res = await api.post(`/orders/${orderId}/refunds`, payload);
      // If the server says needs manager, surface the UI to collect PIN
      if (res.status === 403 && res.data?.requiresManager) {
        setRequiresManager(true);
        setManagerLimit(res.data.limit || 200);
        setError(res.data.error);
        return;
      }
      onRefunded?.();
      onClose();
    } catch (e: any) {
      // Backend may respond 403 with requiresManager on the first attempt
      if (e?.response?.status === 403 && e?.response?.data?.requiresManager) {
        setRequiresManager(true);
        setManagerLimit(e.response.data.limit || 200);
        setError(e.response.data.error);
        return;
      }
      setError(e?.response?.data?.error || e?.message || 'فشل الاسترداد');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || !orderId) return null;

  const refundable = payments.filter((p) => !p.refundedAt);
  const alreadyRefunded = payments.filter((p) => p.refundedAt);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" dir="rtl" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="p-4 border-b border-ink-200 flex items-center justify-between bg-gradient-to-l from-red-50 to-white">
          <div>
            <div className="font-bold text-lg flex items-center gap-2">
              <Undo2 className="w-5 h-5 text-red-600" />
              استرداد من أوردر #{orderNumber}
            </div>
            <div className="text-xs text-ink-500">إجمالي الأوردر: {formatSAR(orderTotal)}</div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-ink-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && (
            <div className="text-center text-ink-400 py-8 text-sm">جاري التحميل...</div>
          )}

          {!loading && refundable.length === 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800">
              ✅ كل دفعات هذا الأوردر تم استردادها بالفعل.
            </div>
          )}

          {!loading && refundable.length > 0 && (
            <>
              {/* Payment list */}
              <div>
                <div className="text-sm font-semibold mb-2">اختر الدفعة المراد استردادها</div>
                <div className="space-y-1.5">
                  {refundable.map((p) => {
                    const cfg = METHOD_LABELS[p.method] || { label: p.method, icon: Wallet, color: 'ink' };
                    const Icon = cfg.icon;
                    const remaining = p.remaining ?? p.amount;
                    return (
                      <label
                        key={p.id}
                        className={`flex items-center gap-3 p-2.5 border rounded-lg cursor-pointer transition ${
                          selectedPaymentId === p.id ? 'border-brand-600 bg-brand-50' : 'border-ink-200 hover:border-ink-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="payment"
                          value={p.id}
                          checked={selectedPaymentId === p.id}
                          onChange={() => {
                            setSelectedPaymentId(p.id);
                            setAmount(String(remaining));
                          }}
                          className="ml-1"
                        />
                        <div className={`p-2 rounded-lg bg-${cfg.color}-100 text-${cfg.color}-700`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm">{cfg.label}</div>
                          <div className="text-[10px] text-ink-500">{new Date(p.createdAt).toLocaleString('ar-EG')}</div>
                        </div>
                        <div className="text-left">
                          <div className="text-xs text-ink-500">متبقي للاسترداد</div>
                          <div className="font-bold text-sm">{formatSAR(remaining)}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Amount */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm font-semibold block mb-1">قيمة الاسترداد</label>
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className={`input flex-1 text-left ${overAmount ? 'border-red-500 bg-red-50' : ''}`}
                      placeholder="0.00"
                    />
                    <button
                      type="button"
                      onClick={() => setAmount(String(maxAmount))}
                      className="px-2 py-1.5 text-xs text-brand-600 hover:bg-brand-50 rounded whitespace-nowrap"
                      title="تعبئة بالمتبقي"
                    >
                      المتبقي
                    </button>
                  </div>
                  {overAmount && (
                    <div className="text-xs text-red-600 mt-1">القيمة أكبر من المتبقي ({formatSAR(maxAmount)})</div>
                  )}
                </div>
                <div>
                  <label className="text-sm font-semibold block mb-1">طريقة ردّ الفلوس</label>
                  <select
                    value={refundMethod}
                    onChange={(e) => setRefundMethod(e.target.value as PaymentMethod)}
                    className="input w-full"
                  >
                    <option value="CASH">كاش</option>
                    <option value="CARD">بطاقة (إلغاء العملية في الـ POS)</option>
                    <option value="INSTAPAY">إنستاباي (إلغاء التحويل)</option>
                    <option value="STORE_CREDIT">رصيد متجر (للاستخدام لاحقاً)</option>
                  </select>
                </div>
              </div>

              {/* Reason */}
              <div>
                <label className="text-sm font-semibold block mb-1">سبب الاسترداد</label>
                <select value={reason} onChange={(e) => setReason(e.target.value)} className="input w-full mb-2">
                  {REFUND_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                {reason === 'أخرى' && (
                  <input
                    type="text"
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="اكتب السبب..."
                    className="input w-full"
                  />
                )}
              </div>

              {/* Reference (optional) */}
              <div>
                <label className="text-sm font-semibold block mb-1">مرجع (اختياري)</label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="رقم إيصال الإلغاء / رقم العملية..."
                  className="input w-full"
                />
              </div>

              {/* P1.1: Manager PIN field (only when amount > cashier limit) */}
              {requiresManager && (
                <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2 text-amber-800 text-sm font-semibold">
                    🔒 الاسترداد أكبر من {managerLimit || 200} EGP — يحتاج موافقة مدير
                  </div>
                  <input
                    type="password"
                    value={managerPin}
                    onChange={(e) => setManagerPin(e.target.value)}
                    placeholder="كلمة مرور المدير"
                    className="input w-full"
                    autoFocus
                  />
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
                </div>
              )}
            </>
          )}

          {/* Already refunded (info) */}
          {!loading && alreadyRefunded.length > 0 && (
            <div className="border-t border-ink-200 pt-3 mt-3">
              <div className="text-xs text-ink-500 mb-1">دفعات تم استردادها سابقاً</div>
              <div className="space-y-1">
                {alreadyRefunded.map((p) => {
                  const cfg = METHOD_LABELS[p.method] || { label: p.method };
                  return (
                    <div key={p.id} className="flex items-center justify-between p-2 bg-ink-50 rounded text-xs">
                      <div>{cfg.label} — {p.refundReason || 'بدون سبب'}</div>
                      <div className="line-through text-ink-500">{formatSAR(p.amount)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-ink-200 bg-ink-50 flex items-center gap-2 justify-end">
          <button onClick={onClose} className="btn-secondary">إلغاء</button>
          <button
            onClick={submit}
            disabled={!valid || submitting}
            className="bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1"
          >
            <Undo2 className="w-4 h-4" />
            {submitting ? 'جاري...' : 'تنفيذ الاسترداد'}
          </button>
        </div>
      </div>
    </div>
  );
}
