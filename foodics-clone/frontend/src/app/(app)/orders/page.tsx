'use client';
import { useEffect, useState } from 'react';
import { api, formatSAR, formatDate } from '@/lib/api';
import { FileDown, FileText, Eye, Edit, X, Trash2, Plus, Minus, Save, CreditCard, Wallet, Banknote, Smartphone, Receipt } from 'lucide-react';

const PAYMENT_METHODS = [
  { v: 'CASH', l: 'كاش', icon: '💵' },
  { v: 'CARD', l: 'بطاقة', icon: '💳' },
  { v: 'INSTAPAY', l: 'InstaPay', icon: '📱' },
  { v: 'VODAFONE_CASH', l: 'فودافون كاش', icon: '📲' },
  { v: 'FAWRY', l: 'فوري', icon: '⚡' },
  { v: 'OTHER', l: 'أخرى', icon: '🔹' },
];

const STATUSES = [
  { v: 'ALL', l: 'الكل' }, { v: 'PENDING', l: 'قيد الانتظار' }, { v: 'CONFIRMED', l: 'مؤكد' },
  { v: 'PREPARING', l: 'قيد التحضير' }, { v: 'READY', l: 'جاهز' },
  { v: 'SERVED', l: 'تم التقديم' }, { v: 'COMPLETED', l: 'مكتمل' }, { v: 'CANCELLED', l: 'ملغي' },
];
const STATUS_COLORS: any = {
  PENDING: 'bg-gray-100 text-gray-700', CONFIRMED: 'bg-blue-100 text-blue-700',
  PREPARING: 'bg-amber-100 text-amber-700', READY: 'bg-emerald-100 text-emerald-700',
  SERVED: 'bg-blue-100 text-blue-700', COMPLETED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-red-100 text-red-700', PAID: 'bg-emerald-100 text-emerald-700', UNPAID: 'bg-amber-100 text-amber-700',
};
const TYPE_LABELS: any = { DINE_IN: '🍽️ صالة', TAKEAWAY: '🛍️ تيك أواي', DELIVERY: '🚚 توصيل' };

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [status, setStatus] = useState('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showOrder, setShowOrder] = useState<any>(null);
  const [editing, setEditing] = useState<any>(null);
  const [confirmCancel, setConfirmCancel] = useState<any>(null);
  const [paying, setPaying] = useState<any>(null);

  useEffect(() => { load(); }, [status, from, to]);

  const load = async () => {
    const params = new URLSearchParams();
    if (status !== 'ALL') params.set('status', status);
    if (from) params.set('startDate', new Date(from).toISOString());
    if (to) params.set('endDate', new Date(to).toISOString());
    const r = await api.get(`/orders?${params}&limit=200`);
    setOrders(r.data.orders);
  };

  const downloadExcel = () => {
    const params = new URLSearchParams();
    if (status !== 'ALL') params.set('status', status);
    if (from) params.set('startDate', new Date(from).toISOString());
    if (to) params.set('endDate', new Date(to).toISOString());
    const token = localStorage.getItem('token');
    fetch(`/api/exports/orders.xlsx?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob()).then((b) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = `orders-${Date.now()}.xlsx`;
        a.click();
      });
  };

  const downloadOrderPDF = (id: string, num: string) => {
    const token = localStorage.getItem('token');
    fetch(`/api/exports/orders/${id}.pdf`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob()).then((b) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = `order-${num}.pdf`;
        a.click();
      });
  };

  const handleCancel = async () => {
    try {
      await api.post(`/orders/${confirmCancel.id}/cancel`);
      setConfirmCancel(null);
      load();
    } catch (e: any) { alert(e.response?.data?.error || 'فشل الإلغاء'); }
  };

  const handleSaveEdit = async (data: any) => {
    try {
      await api.put(`/orders/${editing.id}`, data);
      setEditing(null);
      load();
    } catch (e: any) { alert(e.response?.data?.error || 'فشل التعديل'); }
  };

  const openPayment = async (order: any) => {
    // Load full payment history
    try {
      const r = await api.get(`/orders/${order.id}/payments`);
      setPaying({ ...order, payments: r.data.payments, summary: r.data.summary });
    } catch (e: any) {
      alert('فشل تحميل المدفوعات');
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">الطلبات</h1>
        <button onClick={downloadExcel} className="btn-secondary text-sm"><FileDown className="w-4 h-4" /> تصدير Excel</button>
      </div>
      <div className="flex gap-2 flex-wrap items-center">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input text-sm" placeholder="من" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input text-sm" placeholder="إلى" />
        {STATUSES.map((s) => (
          <button key={s.v} onClick={() => setStatus(s.v)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${status === s.v ? 'bg-brand-600 text-white' : 'bg-white border border-ink-200'}`}>{s.l}</button>
        ))}
      </div>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ink-50">
            <tr className="text-right text-ink-500">
              <th className="p-3">رقم الأوردر</th>
              <th className="p-3">النوع</th>
              <th className="p-3">عدد الأصناف</th>
              <th className="p-3">الإجمالي</th>
              <th className="p-3">الحالة</th>
              <th className="p-3">الدفع</th>
              <th className="p-3">الوقت</th>
              <th className="p-3">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-ink-100 hover:bg-ink-50">
                <td className="p-3 font-mono text-xs">{o.orderNumber}</td>
                <td className="p-3 text-xs">{TYPE_LABELS[o.type]} {o.table ? `طاولة ${o.table.number}` : ''}</td>
                <td className="p-3">{o.items.length}</td>
                <td className="p-3 font-semibold">{formatSAR(o.total)}</td>
                <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[o.status]}`}>{STATUSES.find(s => s.v === o.status)?.l || o.status}</span></td>
                <td className="p-3">
                  {o.paymentStatus === 'PAID' ? (
                    <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS.PAID}`}>
                      مدفوع{o.paidAmount < o.total ? 'ة جزئياً' : ''} {formatSAR(o.paidAmount || 0)}
                    </span>
                  ) : o.paymentStatus === 'PARTIAL' ? (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">
                      جزئي {formatSAR(o.paidAmount || 0)}
                    </span>
                  ) : (
                    <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS.UNPAID}`}>غير مدفوع</span>
                  )}
                </td>
                <td className="p-3 text-xs text-ink-500">{formatDate(o.createdAt)}</td>
                <td className="p-3">
                  <div className="flex gap-1">
                    <button onClick={() => setShowOrder(o)} className="p-1.5 hover:bg-ink-200 rounded" title="عرض"><Eye className="w-3 h-3" /></button>
                    <button onClick={() => openPayment(o)} disabled={o.status === 'CANCELLED' || o.paymentStatus === 'PAID'} className="p-1.5 hover:bg-emerald-50 text-emerald-600 rounded disabled:opacity-30" title="دفع"><CreditCard className="w-3 h-3" /></button>
                    <button onClick={() => setEditing({ ...o, editItems: o.items.map((i: any) => ({ productId: i.productId, quantity: i.quantity, notes: i.notes })) })} disabled={o.status === 'CANCELLED' || o.paymentStatus === 'PAID'} className="p-1.5 hover:bg-blue-50 text-blue-600 rounded disabled:opacity-30" title="تعديل"><Edit className="w-3 h-3" /></button>
                    <button onClick={() => setConfirmCancel(o)} disabled={o.status === 'CANCELLED'} className="p-1.5 hover:bg-red-50 text-red-600 rounded disabled:opacity-30" title="إلغاء"><Trash2 className="w-3 h-3" /></button>
                    <button onClick={() => downloadOrderPDF(o.id, o.orderNumber)} className="p-1.5 hover:bg-ink-200 rounded" title="PDF"><FileText className="w-3 h-3" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showOrder && (
        <Modal title={`تفاصيل ${showOrder.orderNumber}`} onClose={() => setShowOrder(null)}>
          <OrderDetails order={showOrder} onDownloadPDF={() => downloadOrderPDF(showOrder.id, showOrder.orderNumber)} />
        </Modal>
      )}

      {editing && (
        <Modal title={`تعديل الأوردر ${editing.orderNumber}`} onClose={() => setEditing(null)}>
          <OrderEditForm order={editing} onSave={handleSaveEdit} onClose={() => setEditing(null)} />
        </Modal>
      )}

      {confirmCancel && (
        <Modal title="تأكيد الإلغاء" onClose={() => setConfirmCancel(null)}>
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
              <p className="font-bold mb-2">⚠️ هل أنت متأكد من إلغاء هذا الأوردر؟</p>
              <p className="text-sm">رقم الأوردر: <strong>{confirmCancel.orderNumber}</strong></p>
              <p className="text-sm">الإجمالي: <strong>{formatSAR(confirmCancel.total)}</strong></p>
              <p className="text-sm mt-2 text-red-700">⚠️ سيتم استرجاع المخزون تلقائياً</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmCancel(null)} className="btn-secondary flex-1">تراجع</button>
              <button onClick={handleCancel} className="btn-danger flex-1"><Trash2 className="w-4 h-4" /> نعم، إلغاء</button>
            </div>
          </div>
        </Modal>
      )}

      {paying && (
        <Modal title={`💳 الدفع - ${paying.orderNumber}`} onClose={() => setPaying(null)}>
          <PaymentForm order={paying} onPaid={() => { setPaying(null); load(); }} onClose={() => setPaying(null)} />
        </Modal>
      )}
    </div>
  );
}

function OrderDetails({ order, onDownloadPDF }: any) {
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-2 bg-ink-50 p-3 rounded-lg">
        <div><div className="text-ink-500 text-xs">الحالة</div><div className="font-bold">{order.status}</div></div>
        <div><div className="text-ink-500 text-xs">النوع</div><div className="font-bold">{TYPE_LABELS[order.type]}</div></div>
        <div><div className="text-ink-500 text-xs">الكاشير</div><div className="font-bold">{order.user?.name}</div></div>
        {order.table && <div><div className="text-ink-500 text-xs">الطاولة</div><div className="font-bold">طاولة {order.table.number}</div></div>}
        {order.customerName && <div><div className="text-ink-500 text-xs">العميل</div><div className="font-bold">{order.customerName}</div></div>}
        {order.customerPhone && <div><div className="text-ink-500 text-xs">الهاتف</div><div className="font-bold">{order.customerPhone}</div></div>}
        {order.customerAddress && <div className="col-span-2"><div className="text-ink-500 text-xs">العنوان</div><div className="font-bold">{order.customerAddress}</div></div>}
        <div className="col-span-2"><div className="text-ink-500 text-xs">التاريخ</div><div className="font-bold">{formatDate(order.createdAt)}</div></div>
      </div>
      <div>
        <div className="text-ink-500 text-xs mb-2">المنتجات</div>
        {order.items.map((it: any) => (
          <div key={it.id} className="flex justify-between bg-white border rounded p-2 mt-1">
            <span>{it.product.nameAr || it.product.name} × {it.quantity}</span>
            <span className="font-bold">{formatSAR(it.price * it.quantity)}</span>
          </div>
        ))}
      </div>
      <div className="border-t pt-2 space-y-1">
        <div className="flex justify-between"><span>الإجمالي</span><span>{formatSAR(order.subtotal)}</span></div>
        {order.discount > 0 && <div className="flex justify-between text-amber-600"><span>الخصم</span><span>-{formatSAR(order.discount)}</span></div>}
        <div className="flex justify-between"><span>الضريبة</span><span>{formatSAR(order.tax)}</span></div>
        {order.deliveryFee > 0 && <div className="flex justify-between text-purple-600"><span>التوصيل</span><span>{formatSAR(order.deliveryFee)}</span></div>}
        <div className="flex justify-between text-lg font-bold pt-1 border-t"><span>الإجمالي</span><span className="text-brand-600">{formatSAR(order.total)}</span></div>
      </div>
      <button onClick={onDownloadPDF} className="btn-primary w-full"><FileText className="w-4 h-4" /> PDF</button>
    </div>
  );
}

function OrderEditForm({ order, onSave, onClose }: any) {
  const [items, setItems] = useState<any[]>(order.editItems || []);
  const [discount, setDiscount] = useState(order.discount || 0);
  const [type, setType] = useState(order.type);
  const [customerName, setCustomerName] = useState(order.customerName || '');
  const [customerPhone, setCustomerPhone] = useState(order.customerPhone || '');
  const [customerAddress, setCustomerAddress] = useState(order.customerAddress || '');
  const [notes, setNotes] = useState(order.notes || '');
  const [deliveryOptionIds, setDeliveryOptionIds] = useState<any[]>(order.deliveryOptions?.map((d: any) => d.deliveryOptionId) || []);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [deliveryOptions, setDeliveryOptions] = useState<any[]>([]);

  useEffect(() => {
    api.get('/products').then((r) => setAllProducts(r.data.products));
    api.get('/delivery-options').then((r) => setDeliveryOptions(r.data.options));
  }, []);

  const updateQty = (productId: string, qty: number) => {
    if (qty <= 0) {
      setItems(items.filter((i) => i.productId !== productId));
    } else {
      const existing = items.find((i) => i.productId === productId);
      if (existing) {
        setItems(items.map((i) => i.productId === productId ? { ...i, quantity: qty } : i));
      } else {
        setItems([...items, { productId, quantity: qty, notes: '' }]);
      }
    }
  };

  const subtotal = Math.round((items.reduce((s, i) => {
    const p = allProducts.find((ap) => ap.id === i.productId);
    return s + (p?.price || 0) * i.quantity;
  }, 0) + Number.EPSILON) * 100) / 100;
  const deliveryFee = Math.round((deliveryOptionIds.reduce((s, id) => {
    const d = deliveryOptions.find((do_) => do_.id === id);
    return s + (d?.fee || 0);
  }, 0) + Number.EPSILON) * 100) / 100;
  const afterDiscount = Math.max(0, subtotal - discount);
  const tax = Math.round((afterDiscount * 0.15 + Number.EPSILON) * 100) / 100;
  const total = Math.round((afterDiscount + tax + deliveryFee + Number.EPSILON) * 100) / 100;

  const toggleDelivery = (id: string) => {
    setDeliveryOptionIds(deliveryOptionIds.includes(id)
      ? deliveryOptionIds.filter((x) => x !== id)
      : [...deliveryOptionIds, id]);
  };

  const handleSave = () => {
    if (items.length === 0) return alert('لازم يكون فيه منتج واحد على الأقل');
    if (type === 'DELIVERY' && (!customerName || !customerPhone || !customerAddress)) return alert('لازم بيانات العميل كاملة');
    onSave({ type, customerName, customerPhone, customerAddress, notes, items, discount, deliveryOptionIds });
  };

  return (
    <div className="space-y-3 text-sm">
      {order.paymentStatus === 'PAID' && (
        <div className="bg-amber-50 border border-amber-200 rounded p-2 text-amber-800 text-xs">
          ⚠️ لا يمكن تعديل أوردر مدفوع
        </div>
      )}

      <div>
        <label className="text-xs text-ink-500">نوع الطلب</label>
        <div className="flex gap-2 mt-1">
          {[{ v: 'DINE_IN', l: '🍽️ صالة' }, { v: 'TAKEAWAY', l: '🛍️ تيك أواي' }, { v: 'DELIVERY', l: '🚚 توصيل' }].map((t) => (
            <button key={t.v} onClick={() => setType(t.v)} className={`flex-1 px-2 py-1.5 rounded text-xs font-medium ${type === t.v ? 'bg-brand-600 text-white' : 'bg-ink-100'}`}>
              {t.l}
            </button>
          ))}
        </div>
      </div>

      {type === 'DELIVERY' && (
        <div className="space-y-2 bg-purple-50 p-2 rounded">
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="اسم العميل" className="input text-sm" />
          <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="الهاتف" className="input text-sm" />
          <textarea value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} placeholder="العنوان" className="input text-sm" rows={2} />
          <div>
            <div className="text-xs text-ink-500 mb-1">خدمات التوصيل:</div>
            {deliveryOptions.map((d) => (
              <label key={d.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={deliveryOptionIds.includes(d.id)} onChange={() => toggleDelivery(d.id)} />
                {d.nameAr} ({d.fee > 0 ? formatSAR(d.fee) : 'مجاني'})
              </label>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="text-xs text-ink-500 mb-1">المنتجات</div>
        <div className="max-h-60 overflow-y-auto border rounded p-2 space-y-1">
          {items.map((it) => {
            const p = allProducts.find((ap) => ap.id === it.productId);
            return (
              <div key={it.productId} className="flex items-center gap-2 bg-ink-50 rounded p-1.5">
                <div className="text-2xl">{p?.image}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{p?.nameAr}</div>
                  <div className="text-xs text-ink-500">{formatSAR(p?.price || 0)}</div>
                </div>
                <button onClick={() => updateQty(it.productId, it.quantity - 1)} className="p-1 hover:bg-ink-200 rounded"><Minus className="w-3 h-3" /></button>
                <span className="w-8 text-center font-bold">{it.quantity}</span>
                <button onClick={() => updateQty(it.productId, it.quantity + 1)} className="p-1 hover:bg-ink-200 rounded"><Plus className="w-3 h-3" /></button>
                <button onClick={() => updateQty(it.productId, 0)} className="p-1 text-red-500 hover:bg-red-50 rounded"><X className="w-3 h-3" /></button>
              </div>
            );
          })}
          <div className="border-t pt-2">
            <div className="text-xs font-medium text-ink-600 mb-1">إضافة منتج:</div>
            <select className="input text-sm" onChange={(e) => { if (e.target.value) { updateQty(e.target.value, 1); e.target.value = ''; } }}>
              <option value="">اختر منتج...</option>
              {allProducts.filter((p) => !items.find((i) => i.productId === p.id)).map((p) => (
                <option key={p.id} value={p.id}>{p.nameAr} - {formatSAR(p.price)}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-ink-500">الخصم (جنيه)</label>
          <input type="number" value={discount} onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)} className="input text-sm" />
        </div>
        <div>
          <label className="text-xs text-ink-500">ملاحظات</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className="input text-sm" />
        </div>
      </div>

      <div className="border-t pt-2 space-y-1 text-sm bg-ink-50 p-2 rounded">
        <div className="flex justify-between"><span>الإجمالي</span><span>{formatSAR(subtotal)}</span></div>
        {discount > 0 && <div className="flex justify-between text-amber-600"><span>الخصم</span><span>-{formatSAR(discount)}</span></div>}
        <div className="flex justify-between"><span>الضريبة (15%)</span><span>{formatSAR(tax)}</span></div>
        {deliveryFee > 0 && <div className="flex justify-between text-purple-600"><span>التوصيل</span><span>{formatSAR(deliveryFee)}</span></div>}
        <div className="flex justify-between text-lg font-bold pt-1 border-t"><span>الإجمالي</span><span className="text-brand-600">{formatSAR(total)}</span></div>
      </div>

      <div className="flex gap-2">
        <button onClick={onClose} className="btn-secondary flex-1">إلغاء</button>
        <button onClick={handleSave} className="btn-primary flex-1"><Save className="w-4 h-4" /> حفظ التعديل</button>
      </div>
    </div>
  );
}

function Modal({ children, onClose, title }: any) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-ink-100 rounded"><X className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PaymentForm({ order, onPaid, onClose }: any) {
  const [method, setMethod] = useState('CASH');
  const [amount, setAmount] = useState<string>('');
  const [payerName, setPayerName] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const total = order.total;
  const paid = order.summary?.paid || 0;
  const remaining = Math.max(0, total - paid);
  const isFullyPaid = paid >= total - 0.001;

  const setQuickAmount = (val: number) => {
    if (val > remaining) val = remaining;
    setAmount(val.toFixed(2));
  };

  const handleAdd = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError('أدخل قيمة أكبر من صفر'); return; }
    if (amt > remaining + 0.001) { setError(`القيمة تتجاوز المتبقي (${remaining.toFixed(2)})`); return; }
    setLoading(true); setError('');
    try {
      await api.post(`/orders/${order.id}/payments`, {
        method, amount: amt, payerName: payerName || undefined,
        reference: reference || undefined, notes: notes || undefined,
      });
      onPaid();
    } catch (e: any) { setError(e.response?.data?.error || 'فشل إضافة الدفعة'); }
    finally { setLoading(false); }
  };

  if (isFullyPaid) {
    return (
      <div className="space-y-4 text-center py-4">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
          <Receipt className="w-8 h-8 text-emerald-600" />
        </div>
        <p className="text-lg font-bold text-emerald-700">✅ هذا الأوردر مدفوع بالكامل</p>
        <p className="text-sm text-ink-500">{order.payments.length} مدفوعات بإجمالي {paid.toFixed(2)} EGP</p>
        <button onClick={onClose} className="btn-primary">إغلاق</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="bg-ink-50 rounded-lg p-4 space-y-2">
        <div className="flex justify-between text-sm"><span>إجمالي الأوردر:</span><span className="font-bold">{formatSAR(total)}</span></div>
        <div className="flex justify-between text-sm text-emerald-600"><span>المدفوع:</span><span className="font-bold">{formatSAR(paid)}</span></div>
        <div className="flex justify-between text-base font-bold border-t pt-2"><span>المتبقي:</span><span className="text-red-600">{formatSAR(remaining)}</span></div>
      </div>

      {/* Existing payments */}
      {order.payments.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1">
          <p className="text-xs font-bold text-blue-800 mb-1">المدفوعات السابقة ({order.payments.length}):</p>
          {order.payments.map((p: any) => (
            <div key={p.id} className="flex justify-between text-xs text-blue-700">
              <span>{PAYMENT_METHODS.find(m => m.v === p.method)?.icon} {PAYMENT_METHODS.find(m => m.v === p.method)?.l || p.method} {p.payerName && `(${p.payerName})`}</span>
              <span className="font-mono">{formatSAR(p.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Method selection */}
      <div>
        <label className="text-sm font-medium block mb-2">طريقة الدفع</label>
        <div className="grid grid-cols-3 gap-2">
          {PAYMENT_METHODS.map((m) => (
            <button key={m.v} type="button" onClick={() => setMethod(m.v)} className={`p-3 rounded-lg border-2 text-center transition ${method === m.v ? 'border-brand-600 bg-brand-50' : 'border-ink-200 hover:border-ink-300'}`}>
              <div className="text-2xl">{m.icon}</div>
              <div className="text-xs font-medium mt-1">{m.l}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Amount */}
      <div>
        <label className="text-sm font-medium block mb-1">المبلغ</label>
        <div className="flex gap-2 mb-2">
          <button type="button" onClick={() => setQuickAmount(remaining)} className="btn-secondary text-xs flex-1">المتبقي كاملاً</button>
          <button type="button" onClick={() => setQuickAmount(remaining / 2)} className="btn-secondary text-xs flex-1">نص المتبقي</button>
          <button type="button" onClick={() => setQuickAmount(100)} className="btn-secondary text-xs flex-1">100</button>
        </div>
        <input type="number" step="0.01" min="0.01" max={remaining} value={amount} onChange={(e) => setAmount(e.target.value)} className="input text-lg font-bold" placeholder={`0.00 / ${remaining.toFixed(2)}`} autoFocus />
      </div>

      {/* Payer name */}
      <div>
        <label className="text-sm font-medium block mb-1">اسم الدافع (اختياري - مفيد لو 2 عميل يدفعون)</label>
        <input type="text" value={payerName} onChange={(e) => setPayerName(e.target.value)} className="input text-sm" placeholder="مثلاً: أحمد" />
      </div>

      {/* Reference (for non-cash) */}
      {method !== 'CASH' && (
        <div>
          <label className="text-sm font-medium block mb-1">رقم العملية / المرجع (اختياري)</label>
          <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} className="input text-sm" placeholder="مثلاً: TXN-12345" />
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="text-sm font-medium block mb-1">ملاحظات (اختياري)</label>
        <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="input text-sm" placeholder="ملاحظات" />
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 p-2 rounded text-sm">{error}</div>}

      <div className="flex gap-2 pt-2">
        <button onClick={onClose} className="btn-secondary flex-1">إغلاق</button>
        <button onClick={handleAdd} disabled={loading || !amount} className="btn-primary flex-1 disabled:opacity-50">
          {loading ? 'جاري...' : `+ إضافة دفعة ${amount ? `(${parseFloat(amount).toFixed(2)} EGP)` : ''}`}
        </button>
      </div>
    </div>
  );
}
