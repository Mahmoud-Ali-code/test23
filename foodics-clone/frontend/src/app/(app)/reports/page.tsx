'use client';
import { useEffect, useState } from 'react';
import { api, formatSAR } from '@/lib/api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts';
import {
  FileDown, FileText, Banknote, AlertCircle, Undo2, TrendingUp,
  TrendingDown, Wallet, User, RefreshCw,
} from 'lucide-react';

const COLORS = ['#dc2626', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];

const METHOD_LABELS: any = {
  CASH: { label: 'كاش', color: '#10b981' },
  CARD: { label: 'بطاقة', color: '#3b82f6' },
  INSTAPAY: { label: 'إنستاباي', color: '#8b5cf6' },
  STORE_CREDIT: { label: 'رصيد متجر', color: '#f59e0b' },
};

export default function ReportsPage() {
  const [series, setSeries] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [todayStats, setTodayStats] = useState<any | null>(null);
  const [refunds, setRefunds] = useState<any[]>([]);
  const [days, setDays] = useState(7);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const salesParams = new URLSearchParams();
    salesParams.set('days', String(days));
    if (from) salesParams.set('startDate', new Date(from).toISOString());
    if (to) salesParams.set('endDate', new Date(to).toISOString());

    const since = from
      ? new Date(from)
      : new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const ordersParams = new URLSearchParams();
    ordersParams.set('startDate', since.toISOString());
    if (to) ordersParams.set('endDate', new Date(to).toISOString());
    ordersParams.set('limit', '500');

    // Refunds window — same as orders
    const refundParams = new URLSearchParams();
    refundParams.set('startDate', since.toISOString());
    if (to) refundParams.set('endDate', new Date(to).toISOString());
    refundParams.set('limit', '100');

    const showErr = (msg: string) => { if (!cancelled) setError(msg); };

    Promise.all([
      api.get(`/reports/sales?${salesParams}`).then((r) => r.data.series).catch((e) => { showErr(e?.response?.data?.error || e?.message || 'فشل تحميل الإيرادات'); return []; }),
      api.get(`/reports/top-products?limit=10`).then((r) => r.data.topProducts).catch((e) => { showErr(e?.response?.data?.error || e?.message || 'فشل تحميل أعلى المنتجات'); return []; }),
      api.get(`/orders?${ordersParams}`).then((r) => r.data.orders).catch((e) => { showErr(e?.response?.data?.error || e?.message || 'فشل تحميل الطلبات'); return []; }),
      api.get(`/reports/dashboard`).then((r) => r.data.stats).catch(() => null),
      api.get(`/refunds?${refundParams}`).then((r) => r.data.refunds || []).catch((e) => { showErr(e?.response?.data?.error || e?.message || 'فشل تحميل الاستردادات'); return []; }),
    ]).then(([s, t, o, dash, refs]) => {
      if (cancelled) return;
      setSeries(s || []);
      setTopProducts(t || []);
      setOrders(o || []);
      setTodayStats(dash);
      setRefunds(refs || []);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [days, from, to]);

  // Totals across the selected range
  const totalGross = series.reduce((s, x) => s + (x.gross || 0), 0);
  const totalRefunds = series.reduce((s, x) => s + (x.refunds || 0), 0);
  const totalNet = series.reduce((s, x) => s + (x.net ?? x.revenue ?? 0), 0);
  const totalOrders = series.reduce((s, x) => s + x.orders, 0);
  const avgOrder = totalOrders ? totalNet / totalOrders : 0;

  const byType: Record<string, number> = {};
  orders.forEach((o) => { byType[o.type] = (byType[o.type] || 0) + 1; });
  const typeLabels: any = { DINE_IN: 'صالة', TAKEAWAY: 'تيك أواي', DELIVERY: 'توصيل' };
  const typeData = Object.entries(byType).map(([k, v]) => ({ name: typeLabels[k] || k, value: v }));

  // Refund method totals
  const refundByMethod: Record<string, number> = { CASH: 0, CARD: 0, INSTAPAY: 0, STORE_CREDIT: 0 };
  refunds.forEach((r) => {
    if (refundByMethod[r.method] !== undefined) refundByMethod[r.method] += r.amount;
  });
  const refundMethodsData = Object.entries(refundByMethod).filter(([, v]) => v > 0).map(([k, v]) => ({ name: METHOD_LABELS[k]?.label || k, value: v }));

  const downloadOrdersExcel = () => {
    const params = new URLSearchParams();
    if (from) params.set('startDate', new Date(from).toISOString());
    if (to) params.set('endDate', new Date(to).toISOString());
    const token = localStorage.getItem('token');
    fetch(`/api/exports/orders.xlsx?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob()).then((b) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = `orders-report-${Date.now()}.xlsx`;
        a.click();
      });
  };
  const downloadCashierExcel = () => {
    const params = new URLSearchParams();
    if (from) params.set('startDate', new Date(from).toISOString());
    if (to) params.set('endDate', new Date(to).toISOString());
    const token = localStorage.getItem('token');
    fetch(`/api/exports/cashier.xlsx?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob()).then((b) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = `cashier-report-${Date.now()}.xlsx`;
        a.click();
      });
  };
  // P1.6: CSV downloads — simpler format for accountants / pivot tables
  const downloadCsv = (kind: 'orders' | 'payments' | 'refunds') => {
    const params = new URLSearchParams();
    if (from) params.set('startDate', new Date(from).toISOString());
    if (to) params.set('endDate', new Date(to).toISOString());
    const token = localStorage.getItem('token');
    fetch(`/api/exports/${kind}.csv?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob()).then((b) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = `${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
      });
  };
  const downloadDailyPDF = () => {
    const token = localStorage.getItem('token');
    const date = (to || new Date().toISOString()).slice(0, 10);
    fetch(`/api/exports/daily-report.pdf?date=${date}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob()).then((b) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = `daily-report-${date}.pdf`;
        a.click();
      });
  };

  return (
    <div className="p-6 lg:p-8 space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">التقارير والتحليلات</h1>
        <div className="flex gap-2 flex-wrap">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input text-sm" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input text-sm" />
          <button onClick={downloadOrdersExcel} className="btn-secondary text-sm"><FileDown className="w-4 h-4" /> طلبات</button>
          <button onClick={downloadCashierExcel} className="btn-secondary text-sm"><Banknote className="w-4 h-4" /> خزنة</button>
          <div className="relative group">
            <button className="btn-secondary text-sm"><FileDown className="w-4 h-4" /> CSV</button>
            <div className="absolute end-0 top-full mt-1 bg-white border border-ink-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition z-10 min-w-[140px]">
              <button onClick={() => downloadCsv('orders')} className="block w-full text-right px-3 py-2 text-sm hover:bg-ink-50">📋 طلبات (CSV)</button>
              <button onClick={() => downloadCsv('payments')} className="block w-full text-right px-3 py-2 text-sm hover:bg-ink-50">💰 دفعات (CSV)</button>
              <button onClick={() => downloadCsv('refunds')} className="block w-full text-right px-3 py-2 text-sm hover:bg-ink-50">↩️ استردادات (CSV)</button>
            </div>
          </div>
          <button onClick={downloadDailyPDF} className="btn-secondary text-sm"><FileText className="w-4 h-4" /> PDF يومي</button>
        </div>
      </div>

      {error && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ms-auto text-xs underline">إخفاء</button>
        </div>
      )}

      <div className="flex gap-2">
        {[7, 14, 30, 90].map((d) => (
          <button key={d} onClick={() => setDays(d)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${days === d ? 'bg-brand-600 text-white' : 'bg-white border border-ink-200'}`}>{d} يوم</button>
        ))}
      </div>

      {/* Range totals (gross / refunds / net) */}
      <div>
        <div className="text-sm text-ink-500 mb-2">إجمالي الفترة المختارة</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatBox label="إجمالي (صافي)" value={formatSAR(totalNet)} color="emerald" icon={TrendingUp} />
          <StatBox label="إجمالي (إيرادات)" value={formatSAR(totalGross)} color="blue" icon={Wallet} />
          <StatBox label="استردادات" value={formatSAR(totalRefunds)} color="red" icon={Undo2} subtext={totalGross > 0 ? `${(totalRefunds / totalGross * 100).toFixed(1)}% من الإيرادات` : undefined} />
          <StatBox label="عدد الطلبات" value={totalOrders} color="purple" subtext={totalOrders > 0 ? `متوسط ${formatSAR(avgOrder)}` : undefined} />
        </div>
      </div>

      {/* Today's snapshot */}
      {todayStats && (
        <div>
          <div className="text-sm text-ink-500 mb-2 flex items-center gap-1.5">
            <RefreshCw className="w-3 h-3" /> ملخص اليوم (منذ 00:00)
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <StatBox label="إيرادات اليوم (إجمالي)" value={formatSAR(todayStats.todayGross || 0)} color="blue" small icon={Wallet} />
            <StatBox label="استردادات اليوم" value={formatSAR(todayStats.todayRefunds || 0)} color="red" small icon={TrendingDown} />
            <StatBox label="صافي اليوم" value={formatSAR(todayStats.todayRevenue || 0)} color="emerald" small icon={TrendingUp} />
            <StatBox label="طلبات اليوم" value={todayStats.todayOrders || 0} color="purple" small />
            <StatBox label="عملاء (هواتف فريدة)" value={todayStats.todayCustomers || 0} color="amber" small icon={User} />
          </div>
        </div>
      )}

      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">الإيرادات اليومية</h2>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-500" /> صافي</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-500" /> إجمالي</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-500" /> استرداد</span>
          </div>
        </div>
        <div style={{ width: '100%', height: 320, minHeight: 320 }}>
          {loading && !series.length ? (
            <div className="h-full flex items-center justify-center text-ink-400 text-sm">جاري التحميل...</div>
          ) : !series.length ? (
            <div className="h-full flex items-center justify-center text-ink-400 text-sm">لا توجد بيانات في الفترة المختارة</div>
          ) : (
            <ResponsiveContainer>
              <BarChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tickFormatter={(d) => typeof d === 'string' ? d.slice(5) : d} />
                <YAxis />
                <Tooltip
                  formatter={(v: any, n: any) => [formatSAR(Number(v) || 0), n === 'net' ? 'صافي' : n === 'gross' ? 'إجمالي' : n === 'refunds' ? 'استرداد' : n]}
                />
                <Legend formatter={(n: any) => n === 'net' ? 'صافي' : n === 'gross' ? 'إجمالي' : 'استرداد'} />
                <Bar dataKey="gross" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="refunds" fill="#dc2626" radius={[4, 4, 0, 0]} />
                <Bar dataKey="net" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h2 className="font-semibold mb-4">أعلى المنتجات</h2>
          <div style={{ width: '100%', height: 300, minHeight: 300 }}>
            {loading && !topProducts.length ? (
              <div className="h-full flex items-center justify-center text-ink-400 text-sm">جاري التحميل...</div>
            ) : !topProducts.length ? (
              <div className="h-full flex items-center justify-center text-ink-400 text-sm">لا توجد مبيعات</div>
            ) : (
              <ResponsiveContainer>
                <BarChart data={topProducts.slice(0, 5)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey={(d: any) => d.product?.nameAr || d.product?.name} width={100} fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="quantity" fill="#dc2626" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="card p-6">
          <h2 className="font-semibold mb-4">توزيع أنواع الطلبات</h2>
          <div style={{ width: '100%', height: 300, minHeight: 300 }}>
            {loading && !typeData.length ? (
              <div className="h-full flex items-center justify-center text-ink-400 text-sm">جاري التحميل...</div>
            ) : !typeData.length ? (
              <div className="h-full flex items-center justify-center text-ink-400 text-sm">لا توجد طلبات</div>
            ) : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={typeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                    {typeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Refunds panel */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="font-semibold flex items-center gap-2">
            <Undo2 className="w-5 h-5 text-red-600" /> الاستردادات في الفترة المختارة
          </h2>
          <div className="text-2xl font-bold text-red-600">{formatSAR(totalRefunds)}</div>
        </div>

        {refundMethodsData.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {refundMethodsData.map((m) => {
              const k = Object.keys(METHOD_LABELS).find((x) => METHOD_LABELS[x].label === m.name);
              const color = k ? METHOD_LABELS[k].color : '#dc2626';
              return (
                <div key={m.name} className="rounded-lg p-3 border" style={{ borderColor: color + '40', backgroundColor: color + '10' }}>
                  <div className="text-xs text-ink-600">{m.name}</div>
                  <div className="text-lg font-bold" style={{ color }}>{formatSAR(m.value)}</div>
                </div>
              );
            })}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink-50">
              <tr className="text-right text-ink-500">
                <th className="p-2.5">التاريخ</th>
                <th className="p-2.5">رقم الأوردر</th>
                <th className="p-2.5">المبلغ</th>
                <th className="p-2.5">الطريقة</th>
                <th className="p-2.5">السبب</th>
                <th className="p-2.5">بواسطة</th>
              </tr>
            </thead>
            <tbody>
              {refunds.slice(0, 50).map((r: any) => (
                <tr key={r.id} className="border-t border-ink-100 hover:bg-ink-50">
                  <td className="p-2.5 text-xs text-ink-500">{new Date(r.createdAt).toLocaleString('ar-EG')}</td>
                  <td className="p-2.5 font-mono text-xs">#{r.order?.orderNumber || r.orderId?.slice(-6) || '—'}</td>
                  <td className="p-2.5 font-bold text-red-600">-{formatSAR(r.amount)}</td>
                  <td className="p-2.5">
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-ink-100">{METHOD_LABELS[r.method]?.label || r.method}</span>
                  </td>
                  <td className="p-2.5 text-xs">{r.reason || '—'}</td>
                  <td className="p-2.5 text-xs text-ink-600">{r.processedBy?.name || '—'}</td>
                </tr>
              ))}
              {refunds.length === 0 && (
                <tr><td colSpan={6} className="text-center text-ink-400 py-12">مفيش استردادات في الفترة دي</td></tr>
              )}
            </tbody>
          </table>
          {refunds.length > 50 && (
            <div className="text-xs text-ink-500 text-center pt-2">عرض أول 50 من {refunds.length} استرداد</div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, color, subtext, small, icon: Icon }: any) {
  const c: any = {
    emerald: 'border-emerald-200 bg-emerald-50',
    blue: 'border-blue-200 bg-blue-50',
    purple: 'border-purple-200 bg-purple-50',
    amber: 'border-amber-200 bg-amber-50',
    red: 'border-red-200 bg-red-50',
  };
  return (
    <div className={`rounded-2xl p-4 border ${c[color]}`}>
      <div className="flex items-center gap-1.5 text-xs text-ink-600">
        {Icon && <Icon className="w-3.5 h-3.5" />}
        {label}
      </div>
      <div className={`font-bold mt-1 ${small ? 'text-lg' : 'text-2xl'}`}>{value}</div>
      {subtext && <div className="text-[10px] text-ink-500 mt-0.5">{subtext}</div>}
    </div>
  );
}
