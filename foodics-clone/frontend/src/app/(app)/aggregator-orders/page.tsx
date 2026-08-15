'use client';
import { useEffect, useState } from 'react';
import { api, formatSAR } from '@/lib/api';
import { toast } from '@/components/Toast';
import {
  Check, X, RefreshCw, Webhook, Phone, MapPin, Package, AlertTriangle, Clock, FileText, Eye,
} from 'lucide-react';

export default function AggregatorOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  const [rejecting, setRejecting] = useState<any | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [acting, setActing] = useState(false);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get('/aggregator-orders/pending');
      setOrders(r.data.orders);
    } catch (e: any) {
      toast.error('فشل تحميل الطلبات');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); const i = setInterval(load, 20000); return () => clearInterval(i); }, []);

  const approve = async (o: any) => {
    if (o.items?.length === 0) {
      return toast.error('مفيش أصناف مربوطة — عدّل الـ mapping أو ضيف الأصناف يدوي');
    }
    if (!confirm(`موافقة على أوردر #${o.externalOrderId} من ${o.aggregator?.name}؟ الإجمالي ${formatSAR(o.total)}`)) return;
    setActing(true);
    try {
      await api.post(`/orders/${o.id}/approve-aggregator`);
      toast.success(`تم قبول أوردر #${o.externalOrderId}`);
      load();
      setSelected(null);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'فشل القبول');
    } finally { setActing(false); }
  };

  const reject = async () => {
    if (!rejecting) return;
    setActing(true);
    try {
      await api.post(`/orders/${rejecting.id}/reject-aggregator`, { reason: rejectReason || null });
      toast.success(`تم رفض أوردر #${rejecting.externalOrderId}`);
      setRejecting(null);
      setRejectReason('');
      load();
      setSelected(null);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'فشل الرفض');
    } finally { setActing(false); }
  };

  return (
    <div className="p-6 lg:p-8 space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Webhook className="w-6 h-6" /> طلبات المنصات
          </h1>
          <p className="text-sm text-ink-500 mt-1">
            أوردرات جاية من منصات التوصيل (طلبات مصر، talabat، elmenus). راجع كل أوردر ووافق أو ارفض.
          </p>
        </div>
        <button onClick={load} className="btn-ghost" title="تحديث">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {orders.length === 0 ? (
        <div className="card p-12 text-center text-ink-400">
          <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg">مفيش طلبات من المنصات دلوقتي</p>
          <p className="text-sm mt-2">لما منصة بتبعت أوردر جديد هيتظهر هنا</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {orders.map((o) => {
            const age = Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 60000);
            const ageColor = age > 15 ? 'text-red-600' : age > 5 ? 'text-amber-600' : 'text-ink-500';
            const itemsMissing = o.items?.length === 0;
            return (
              <div key={o.id} className={`card p-4 ${itemsMissing ? 'border-amber-300 bg-amber-50/30' : ''}`}>
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-base">#{o.orderNumber}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-purple-100 text-purple-700">
                      {o.aggregator?.name}
                    </span>
                    <code className="text-[10px] bg-ink-100 px-1.5 py-0.5 rounded">{o.externalOrderId}</code>
                  </div>
                  <div className="text-left">
                    <div className="text-xl font-bold text-brand-600">{formatSAR(o.total)}</div>
                  </div>
                </div>

                <div className="text-xs text-ink-500 flex items-center gap-1 mb-2 flex-wrap">
                  <Clock className={`w-3 h-3 ${ageColor}`} />
                  <span className={ageColor}>قبل {age} دقيقة</span>
                  {o.items?.length > 0 && <span>• {o.items.reduce((s: number, i: any) => s + i.quantity, 0)} صنف</span>}
                </div>

                {/* Customer */}
                <div className="bg-ink-50 rounded-lg p-2 mb-2 text-xs space-y-1">
                  <div className="flex items-center gap-1 font-semibold">
                    <span>{o.customerName || 'بدون اسم'}</span>
                  </div>
                  <div className="flex items-center gap-1 text-ink-600">
                    <Phone className="w-3 h-3" /> {o.customerPhone || '—'}
                  </div>
                  {o.customerAddress && (
                    <div className="flex items-center gap-1 text-ink-600">
                      <MapPin className="w-3 h-3" /> <span className="truncate">{o.customerAddress}</span>
                    </div>
                  )}
                </div>

                {/* Items */}
                {o.items?.length > 0 ? (
                  <div className="bg-ink-50 rounded-lg p-2 mb-2">
                    <div className="text-[10px] text-ink-500 mb-1 flex items-center gap-1">
                      <Package className="w-3 h-3" /> الأصناف
                    </div>
                    {o.items.map((it: any) => (
                      <div key={it.id} className="text-xs flex justify-between py-0.5">
                        <span>{it.product?.nameAr || it.product?.name || 'صنف غير مربوط'}</span>
                        <span className="text-ink-500">×{it.quantity} • {formatSAR(it.price * it.quantity)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 mb-2 text-xs text-amber-700 flex items-start gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>مفيش أصناف مربوطة — الكاشير لازم يضيفهم يدوي قبل القبول.</span>
                  </div>
                )}

                {o.notes && (
                  <div className="text-xs bg-blue-50 border border-blue-200 rounded p-2 mb-2 text-blue-700">
                    📝 {o.notes}
                  </div>
                )}

                <div className="flex gap-2 mt-3">
                  <button onClick={() => setSelected(o)} className="flex-1 btn-ghost text-xs">
                    <Eye className="w-3.5 h-3.5" /> تفاصيل
                  </button>
                  <button onClick={() => setRejecting(o)} className="btn-ghost text-xs text-red-600">
                    <X className="w-3.5 h-3.5" /> رفض
                  </button>
                  <button onClick={() => approve(o)} disabled={acting} className="btn-primary text-xs flex-1">
                    <Check className="w-3.5 h-3.5" /> قبول
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-ink-200 flex items-center justify-between">
              <h3 className="font-bold text-lg">أوردر #{selected.orderNumber} — {selected.aggregator?.name}</h3>
              <button onClick={() => setSelected(null)} className="p-1.5 hover:bg-ink-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-ink-500">رقم المنصة:</span> <code className="bg-ink-100 px-1.5 py-0.5 rounded">{selected.externalOrderId}</code></div>
                <div><span className="text-ink-500">الحالة:</span> {selected.status}</div>
                <div><span className="text-ink-500">التاريخ:</span> {new Date(selected.createdAt).toLocaleString('ar-EG')}</div>
                <div><span className="text-ink-500">النوع:</span> {selected.type}</div>
              </div>
              <div className="border-t border-ink-200 pt-3">
                <div className="font-semibold mb-1">العميل</div>
                <div className="bg-ink-50 rounded p-2 text-xs space-y-1">
                  <div>{selected.customerName}</div>
                  <div>{selected.customerPhone}</div>
                  {selected.customerAddress && <div>{selected.customerAddress}</div>}
                </div>
              </div>
              <div className="border-t border-ink-200 pt-3">
                <div className="font-semibold mb-1">الأصناف</div>
                <div className="space-y-1 text-xs">
                  {selected.items?.map((it: any) => (
                    <div key={it.id} className="flex justify-between bg-ink-50 rounded p-2">
                      <span>{it.product?.nameAr || it.product?.name || 'صنف غير مربوط'}</span>
                      <span className="text-ink-500">×{it.quantity} • {formatSAR(it.price * it.quantity)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t border-ink-200 pt-3 space-y-1 text-xs">
                <div className="flex justify-between"><span>الإجمالي قبل الضريبة:</span><span>{formatSAR(selected.subtotal)}</span></div>
                <div className="flex justify-between"><span>الضريبة:</span><span>{formatSAR(selected.tax)}</span></div>
                <div className="flex justify-between"><span>رسوم التوصيل:</span><span>{formatSAR(selected.deliveryFee)}</span></div>
                <div className="flex justify-between font-bold text-base pt-1 border-t border-ink-300">
                  <span>الإجمالي:</span><span className="text-brand-600">{formatSAR(selected.total)}</span>
                </div>
              </div>
              {selected.notes && (
                <div className="border-t border-ink-200 pt-3">
                  <div className="font-semibold mb-1">ملاحظات</div>
                  <div className="text-xs bg-blue-50 border border-blue-200 rounded p-2 text-blue-700">{selected.notes}</div>
                </div>
              )}
              <details className="border-t border-ink-200 pt-3">
                <summary className="cursor-pointer text-xs text-ink-500 hover:text-ink-700 flex items-center gap-1">
                  <FileText className="w-3 h-3" /> الـ payload الأصلي من المنصة
                </summary>
                <pre className="mt-2 p-2 bg-ink-50 rounded text-[10px] overflow-x-auto max-h-40">{selected.aggregatorPayload}</pre>
              </details>
            </div>
            <div className="p-4 border-t border-ink-200 flex gap-2 justify-end">
              <button onClick={() => setSelected(null)} className="btn-secondary">إغلاق</button>
              <button onClick={() => { setRejecting(selected); }} className="btn-ghost text-red-600">
                <X className="w-4 h-4" /> رفض
              </button>
              <button onClick={() => approve(selected)} disabled={acting} className="btn-primary">
                <Check className="w-4 h-4" /> قبول
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {rejecting && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={() => setRejecting(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-ink-200 bg-red-50">
              <h3 className="font-bold text-lg text-red-700 flex items-center gap-2">
                <X className="w-5 h-5" /> رفض أوردر #{rejecting.externalOrderId}
              </h3>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-ink-600">هل أنت متأكد من رفض هذا الأوردر؟ هيتم تسجيل السبب في سجل التدقيق.</p>
              <div>
                <label className="text-sm font-medium block mb-1">سبب الرفض (اختياري)</label>
                <textarea
                  className="input"
                  rows={3}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="مثال: صنف غير متاح، العميل ملغي الطلب، .."
                />
              </div>
            </div>
            <div className="p-4 border-t border-ink-200 flex gap-2 justify-end">
              <button onClick={() => { setRejecting(null); setRejectReason(''); }} className="btn-secondary">إلغاء</button>
              <button onClick={reject} disabled={acting} className="bg-red-600 text-white hover:bg-red-700 rounded-lg px-4 py-2 font-semibold flex items-center gap-1">
                <X className="w-4 h-4" /> {acting ? 'جاري الرفض...' : 'تأكيد الرفض'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
