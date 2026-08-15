'use client';
import { useEffect, useState, useMemo } from 'react';
import { api, formatSAR, formatDate } from '@/lib/api';
import {
  Users, Search, Plus, Phone, MapPin, Receipt, AlertCircle, X,
  Edit2, Trash2, ChevronRight, Banknote, TrendingUp,
} from 'lucide-react';

type Tab = 'all' | 'outstanding' | 'debt';

const STATUS_LABEL: any = { UNPAID: 'غير مدفوع', PARTIAL: 'جزئي', PAID: 'مدفوع' };
const STATUS_COLOR: any = {
  UNPAID: 'bg-red-100 text-red-700',
  PARTIAL: 'bg-amber-100 text-amber-700',
  PAID: 'bg-emerald-100 text-emerald-700',
};
const TYPE_LABEL: any = { DINE_IN: 'صالة', TAKEAWAY: 'تيك أواي', DELIVERY: 'توصيل' };

export default function CustomersPage() {
  const [tab, setTab] = useState<Tab>('all');
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [detail, setDetail] = useState<any | null>(null);

  const PAGE_SIZE = 30;

  const load = async (append = false) => {
    if (append) setLoadingMore(true); else setLoading(true);
    setError(null);
    try {
      if (tab === 'debt') {
        const r = await api.get('/customers/debt');
        setCustomers(r.data.customers || []);
        setHasMore(false);
        setNextCursor(null);
      } else {
        const params = new URLSearchParams();
        if (tab === 'outstanding') params.set('outstanding', 'true');
        if (search.trim()) params.set('search', search.trim());
        params.set('limit', String(PAGE_SIZE));
        if (append && nextCursor) params.set('cursor', nextCursor);
        const r = await api.get(`/customers?${params}`);
        const list = r.data.customers || [];
        setCustomers(append ? [...customers, ...list] : list);
        setHasMore(r.data.hasMore || false);
        setNextCursor(r.data.nextCursor || null);
      }
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'فشل تحميل العملاء');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => { load(); }, [tab]);
  // Search with a tiny debounce so the cashier doesn't get a spinner on every keystroke
  useEffect(() => {
    if (tab === 'debt') return; // debt list doesn't take search
    const t = setTimeout(() => { load(); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const totals = useMemo(() => ({
    count: customers.length,
    outstanding: customers.reduce((s, c) => s + (c.outstanding || 0), 0),
    spent: customers.reduce((s, c) => s + (c.totalSpent || 0), 0),
    orders: customers.reduce((s, c) => s + (c.ordersCount || c._count?.orders || 0), 0),
  }), [customers]);

  const save = async (data: any) => {
    try {
      if (data.id) await api.put(`/customers/${data.id}`, data);
      else await api.post('/customers', data);
      setEditing(null);
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.error || e?.message || 'فشل الحفظ');
    }
  };
  const del = async (c: any) => {
    if (!confirm(`تعطيل العميل "${c.name}"؟ الطلبات القديمة بتفضل موجودة.`)) return;
    try {
      await api.delete(`/customers/${c.id}`);
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.error || e?.message || 'فشل الحذف');
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="w-6 h-6" /> العملاء</h1>
          <p className="text-sm text-ink-500 mt-1">سجل العملاء وديونهم — بيتربط تلقائياً بأوردرات التوصيل</p>
        </div>
        <button onClick={() => setEditing({})} className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> عميل جديد
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatBox label="عدد العملاء" value={totals.count} color="blue" />
        <StatBox label="إجمالي الديون" value={formatSAR(totals.outstanding)} color="red" />
        <StatBox label="إجمالي الإنفاق" value={formatSAR(totals.spent)} color="emerald" />
        <StatBox label="إجمالي الطلبات" value={totals.orders} color="purple" />
      </div>

      <div className="flex gap-2 border-b border-ink-200">
        <TabBtn active={tab === 'all'} onClick={() => setTab('all')}>
          <Users className="w-4 h-4" /> كل العملاء
        </TabBtn>
        <TabBtn active={tab === 'outstanding'} onClick={() => setTab('outstanding')}>
          <AlertCircle className="w-4 h-4" /> عليهم متبقي
        </TabBtn>
        <TabBtn active={tab === 'debt'} onClick={() => setTab('debt')}>
          <Banknote className="w-4 h-4" /> قائمة التحصيل
        </TabBtn>
      </div>

      {tab !== 'debt' && (
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالاسم أو رقم الهاتف..."
            className="input pr-10 text-right"
          />
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div className="text-center text-ink-400 py-12">جاري التحميل...</div>
      ) : customers.length === 0 ? (
        <div className="text-center text-ink-400 py-16">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>مفيش عملاء {tab === 'outstanding' ? 'عليهم متبقي' : tab === 'debt' ? 'للتحصيل' : ''}</p>
          {tab === 'all' && <p className="text-xs mt-1">سيتم ربط أي عميل توصيل تلقائياً</p>}
        </div>
      ) : tab === 'debt' ? (
        <DebtList customers={customers} onOpen={(c) => setDetail(c)} />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {customers.map((c) => (
              <CustomerCard
                key={c.id}
                customer={c}
                onOpen={() => setDetail(c)}
                onEdit={() => setEditing(c)}
                onDelete={() => del(c)}
              />
            ))}
          </div>
          {hasMore && (
            <div className="text-center pt-2">
              <button
                onClick={() => load(true)}
                disabled={loadingMore}
                className="btn-secondary text-sm disabled:opacity-50"
              >
                {loadingMore ? 'جاري التحميل...' : `تحميل المزيد (${customers.length}+ عملاء)`}
              </button>
            </div>
          )}
        </>
      )}

      {editing && (
        <CustomerForm
          customer={editing}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}
      {detail && (
        <CustomerDetail
          customerId={detail.id}
          onClose={() => setDetail(null)}
          onCollected={load}
        />
      )}
    </div>
  );
}

function StatBox({ label, value, color }: any) {
  const c: any = {
    blue: 'border-blue-200 bg-blue-50',
    red: 'border-red-200 bg-red-50',
    emerald: 'border-emerald-200 bg-emerald-50',
    purple: 'border-purple-200 bg-purple-50',
  };
  return (
    <div className={`rounded-2xl p-4 border ${c[color]}`}>
      <div className="text-xs text-ink-600">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: any) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 flex items-center gap-1 ${
        active ? 'border-brand-600 text-brand-600' : 'border-transparent text-ink-500 hover:text-ink-700'
      }`}
    >
      {children}
    </button>
  );
}

function CustomerCard({ customer, onOpen, onEdit, onDelete }: any) {
  const initials = (customer.name || '?').charAt(0).toUpperCase();
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-12 h-12 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-lg flex-shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-base truncate">{customer.name}</div>
            <div className="text-xs text-ink-500 flex items-center gap-1 mt-0.5">
              <Phone className="w-3 h-3" /> {customer.phone}
            </div>
            {customer.address && (
              <div className="text-xs text-ink-500 flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3" />
                <span className="truncate">{customer.address}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
        <div className="bg-ink-50 rounded-lg p-2">
          <div className="text-ink-500">الطلبات</div>
          <div className="font-bold text-base">{customer.ordersCount || customer._count?.orders || 0}</div>
        </div>
        <div className="bg-ink-50 rounded-lg p-2">
          <div className="text-ink-500">الإنفاق</div>
          <div className="font-bold text-base text-emerald-600">{formatSAR(customer.totalSpent || 0)}</div>
        </div>
      </div>

      {customer.outstanding > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-2 mb-3 flex items-center justify-between">
          <div className="text-xs text-red-700 font-medium">عليه متبقي</div>
          <div className="font-bold text-red-700">{formatSAR(customer.outstanding)}</div>
        </div>
      )}

      {customer.lastOrderAt && (
        <div className="text-[10px] text-ink-400 mb-3">
          آخر طلب: {formatDate(customer.lastOrderAt)}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={onOpen} className="btn-secondary text-xs flex-1">
          <ChevronRight className="w-3 h-3" /> تفاصيل
        </button>
        <button onClick={onEdit} className="btn-secondary text-xs">
          <Edit2 className="w-3 h-3" />
        </button>
        <button onClick={onDelete} className="btn-secondary text-xs text-red-600">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function DebtList({ customers, onOpen }: any) {
  const total = customers.reduce((s: number, c: any) => s + c.outstanding, 0);
  return (
    <div className="space-y-3">
      <div className="card p-4 bg-red-50 border-red-200 flex items-center justify-between">
        <div>
          <div className="font-semibold text-red-800">إجمالي التحصيل المستحق</div>
          <div className="text-xs text-red-600 mt-0.5">{customers.length} عميل عليهم متبقي</div>
        </div>
        <div className="text-2xl font-bold text-red-700">{formatSAR(total)}</div>
      </div>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ink-50">
            <tr className="text-right text-ink-500">
              <th className="p-3">العميل</th>
              <th className="p-3">الهاتف</th>
              <th className="p-3">طلبات عليها متبقي</th>
              <th className="p-3">المتبقي</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c: any) => (
              <tr key={c.id} className="border-t border-ink-100 hover:bg-ink-50">
                <td className="p-3 font-bold">{c.name}</td>
                <td className="p-3"><a href={`tel:${c.phone}`} className="text-brand-600 hover:underline flex items-center gap-1"><Phone className="w-3 h-3" /> {c.phone}</a></td>
                <td className="p-3">
                  <div className="space-y-1">
                    {(c.orders || []).slice(0, 3).map((o: any) => (
                      <div key={o.id} className="text-xs">
                        <span className="font-mono">#{o.orderNumber}</span>
                        <span className="text-ink-500 mr-2">({TYPE_LABEL[o.status] || o.status})</span>
                        <span className="text-red-600 font-bold">{formatSAR(o.total - o.paidAmount)}</span>
                      </div>
                    ))}
                    {c.orders?.length > 3 && (
                      <div className="text-xs text-ink-400">+{c.orders.length - 3} طلبات أخرى</div>
                    )}
                  </div>
                </td>
                <td className="p-3 font-bold text-red-600">{formatSAR(c.outstanding)}</td>
                <td className="p-3">
                  <button onClick={() => onOpen(c)} className="text-brand-600 hover:bg-brand-50 p-1.5 rounded">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CustomerForm({ customer, onClose, onSave }: any) {
  const [form, setForm] = useState({
    id: customer.id,
    name: customer.name || '',
    phone: customer.phone || '',
    address: customer.address || '',
    notes: customer.notes || '',
  });
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose} dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-ink-200 flex items-center justify-between">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Users className="w-5 h-5" />
            {customer.id ? 'تعديل عميل' : 'عميل جديد'}
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-ink-100 rounded"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-sm font-medium block mb-1">الاسم *</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">رقم الهاتف * <span className="text-xs text-ink-500 font-normal">(لازم يكون فريد)</span></label>
            <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="01xxxxxxxxx" />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">العنوان</label>
            <textarea className="input" rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">ملاحظات</label>
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <p className="text-xs text-ink-500">
            💡 إجمالي الإنفاق والمتبقي بيتحسبوا تلقائياً من أوردرات العميل.
          </p>
        </div>
        <div className="p-4 border-t border-ink-200 flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">إلغاء</button>
          <button
            onClick={() => onSave(form)}
            disabled={!form.name || !form.phone}
            className="btn-primary flex-1 disabled:opacity-50"
          >
            حفظ
          </button>
        </div>
      </div>
    </div>
  );
}

function CustomerDetail({ customerId, onClose, onCollected }: any) {
  const [customer, setCustomer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [collectOrder, setCollectOrder] = useState<any | null>(null);

  useEffect(() => {
    setLoading(true);
    api.get(`/customers/${customerId}`).then((r) => setCustomer(r.data.customer)).finally(() => setLoading(false));
  }, [customerId]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose} dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-ink-200 flex items-center justify-between bg-brand-50">
          <h3 className="font-bold text-lg flex items-center gap-2"><Users className="w-5 h-5" /> تفاصيل العميل</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-brand-100 rounded"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading || !customer ? (
            <div className="text-center text-ink-400 py-12">جاري التحميل...</div>
          ) : (
            <div className="space-y-4">
              <div className="card p-4">
                <div className="font-bold text-lg mb-2">{customer.name}</div>
                <div className="text-sm space-y-1 text-ink-600">
                  <div className="flex items-center gap-1"><Phone className="w-3 h-3" /> {customer.phone}</div>
                  {customer.address && <div className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {customer.address}</div>}
                </div>
                {customer.notes && <div className="text-xs bg-amber-50 border border-amber-200 rounded p-2 mt-2">📝 {customer.notes}</div>}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="card p-3 text-center">
                  <div className="text-xs text-ink-500">إجمالي الإنفاق</div>
                  <div className="text-lg font-bold text-emerald-600">{formatSAR(customer.totalSpent)}</div>
                </div>
                <div className="card p-3 text-center">
                  <div className="text-xs text-ink-500">المتبقي</div>
                  <div className={`text-lg font-bold ${customer.outstanding > 0 ? 'text-red-600' : 'text-ink-400'}`}>{formatSAR(customer.outstanding)}</div>
                </div>
                <div className="card p-3 text-center">
                  <div className="text-xs text-ink-500">عدد الطلبات</div>
                  <div className="text-lg font-bold">{customer.ordersCount || 0}</div>
                </div>
              </div>

              {customer.outstanding > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-red-700">عليه دين {formatSAR(customer.outstanding)}</div>
                    <div className="text-xs text-red-600">تقدر تسجل دفعة على حسابه</div>
                  </div>
                  <button
                    onClick={() => setCollectOrder(collectOrder ? null : customer)}
                    className="bg-red-600 text-white hover:bg-red-700 text-sm font-bold rounded-lg px-4 py-2 flex items-center gap-1"
                  >
                    <Banknote className="w-4 h-4" /> تحصيل دفعة
                  </button>
                </div>
              )}

              <div>
                <h4 className="font-bold text-sm mb-2 flex items-center gap-1">
                  <Receipt className="w-4 h-4" /> كل الطلبات ({(customer.orders || []).length})
                </h4>
                <div className="space-y-1.5">
                  {(customer.orders || []).map((o: any) => (
                    <div key={o.id} className="card p-3 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm">#{o.orderNumber}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_COLOR[o.paymentStatus]}`}>{STATUS_LABEL[o.paymentStatus] || o.paymentStatus}</span>
                        </div>
                        <div className="text-xs text-ink-500 mt-0.5">
                          {TYPE_LABEL[o.type] || o.type} • {formatDate(o.createdAt)}
                        </div>
                      </div>
                      <div className="text-left">
                        <div className="font-bold text-sm">{formatSAR(o.total)}</div>
                        {o.total - o.paidAmount > 0 && (
                          <div className="text-xs text-red-600">متبقي {formatSAR(o.total - o.paidAmount)}</div>
                        )}
                      </div>
                    </div>
                  ))}
                  {(customer.orders || []).length === 0 && (
                    <div className="text-center text-ink-400 py-6 text-sm">مفيش طلبات</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {collectOrder && (
        <CollectPaymentModal
          customer={collectOrder}
          onClose={() => setCollectOrder(null)}
          onCollected={async () => {
            setCollectOrder(null);
            // Refresh customer detail + parent list
            const fresh = await api.get(`/customers/${customerId}`);
            setCustomer(fresh.data.customer);
            if (onCollected) onCollected();
          }}
        />
      )}
    </div>
  );
}

/**
 * Collect-payment modal: applies a payment to a customer's oldest outstanding orders
 * (FIFO). The cashier picks amount + method; we allocate against the orders with
 * the most remaining amount until the amount is fully allocated.
 */
function CollectPaymentModal({ customer, onClose, onCollected }: {
  customer: any;
  onClose: () => void;
  onCollected: () => void;
}) {
  // Build the FIFO list of outstanding (UNPAID/PARTIAL) orders, oldest first
  const outstandingOrders = (customer.orders || [])
    .filter((o: any) => o.paymentStatus !== 'PAID' && o.paymentStatus !== 'CANCELLED')
    .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const [amount, setAmount] = useState<string>(String(customer.outstanding || 0));
  const [method, setMethod] = useState<string>('CASH');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string>('');

  const amt = parseFloat(amount) || 0;
  const overAmount = amt > customer.outstanding + 0.01;
  const underAmount = amt <= 0;
  const valid = !overAmount && !underAmount;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      // FIFO allocation: walk outstanding orders and post a partial payment to each
      // until we've allocated the full collected amount.
      let remaining = amt;
      const results: any[] = [];
      for (const o of outstandingOrders) {
        if (remaining <= 0.001) break;
        const due = o.total - o.paidAmount;
        if (due <= 0) continue;
        const payAmt = Math.min(remaining, due);
        const r = await api.post(`/orders/${o.id}/payments`, {
          method,
          amount: Number(payAmt.toFixed(2)),
          notes: notes || `تحصيل من العميل ${customer.name}`,
        });
        results.push({ orderId: o.id, amount: payAmt, fullyPaid: r.data.summary?.isFullyPaid });
        remaining = Math.max(0, remaining - payAmt);
      }
      if (remaining > 0.01) {
        setError(`لم يتم توزيع ${remaining.toFixed(2)} EGP على أي أوردر`);
        return;
      }
      onCollected();
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'فشل التحصيل');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={onClose} dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-ink-200 flex items-center justify-between bg-red-50">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Banknote className="w-5 h-5 text-red-600" /> تحصيل دفعة من {customer.name}
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-red-100 rounded"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
            <div className="text-xs text-red-600">إجمالي الدين</div>
            <div className="text-2xl font-bold text-red-700">{formatSAR(customer.outstanding)}</div>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">قيمة التحصيل *</label>
            <div className="flex gap-1.5">
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={`input flex-1 text-lg ${overAmount ? 'border-red-500 bg-red-50' : ''}`}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setAmount(String(customer.outstanding))}
                className="px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded whitespace-nowrap border border-red-200"
              >
                تحصيل كامل
              </button>
            </div>
            {overAmount && <div className="text-xs text-red-600 mt-1">القيمة أكبر من الدين</div>}
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">طريقة الدفع</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className="input w-full">
              <option value="CASH">كاش</option>
              <option value="CARD">بطاقة</option>
              <option value="INSTAPAY">إنستاباي</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">ملاحظات (اختياري)</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className="input" placeholder="مثال: تحصيل جزئي من دين قديم" />
          </div>

          {outstandingOrders.length > 0 && (
            <div className="bg-ink-50 rounded-lg p-2 text-xs">
              <div className="font-semibold text-ink-700 mb-1">سيتم التوزيع على ({outstandingOrders.length} أوردر):</div>
              <div className="space-y-0.5 text-ink-500 max-h-24 overflow-y-auto">
                {outstandingOrders.slice(0, 5).map((o: any) => (
                  <div key={o.id} className="flex items-center justify-between">
                    <span className="font-mono">#{o.orderNumber}</span>
                    <span>متبقي {formatSAR(o.total - o.paidAmount)}</span>
                  </div>
                ))}
                {outstandingOrders.length > 5 && <div className="text-ink-400">+ {outstandingOrders.length - 5} أوردرات</div>}
              </div>
              <div className="text-[10px] text-ink-400 mt-1">💡 التوزيع تلقائي (الأقدم أولاً)</div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-2 text-sm">{error}</div>
          )}
        </div>
        <div className="p-4 border-t border-ink-200 flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">إلغاء</button>
          <button
            onClick={submit}
            disabled={!valid || submitting}
            className="bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex-1 font-bold rounded-lg flex items-center justify-center gap-1"
          >
            <Banknote className="w-4 h-4" />
            {submitting ? 'جاري التحصيل...' : `تحصيل ${formatSAR(amt)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
