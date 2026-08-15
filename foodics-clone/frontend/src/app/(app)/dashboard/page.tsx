'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, formatSAR } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { DollarSign, ShoppingBag, Users, Clock, TrendingUp, Package, AlertTriangle, FileDown, FileText } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function Dashboard() {
  const router = useRouter();
  const { user, token, _hydrated } = useAuth();
  const [data, setData] = useState<any>(null);
  const [series, setSeries] = useState<any[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    if (!_hydrated || !token) return;
    api.get('/reports/dashboard').then((r) => setData(r.data)).catch(() => {});
    api.get('/reports/sales?days=7').then((r) => setSeries(r.data.series)).catch(() => {});
    const i = setInterval(() => {
      api.get('/reports/dashboard').then((r) => setData(r.data)).catch(() => {});
    }, 15000);
    return () => clearInterval(i);
  }, [token, _hydrated]);

  const downloadExcel = () => {
    const params = new URLSearchParams();
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
  const downloadPDF = () => {
    const token = localStorage.getItem('token');
    const date = new Date().toISOString().slice(0, 10);
    fetch(`/api/exports/daily-report.pdf?date=${date}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob()).then((b) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = `daily-report-${date}.pdf`;
        a.click();
      });
  };

  if (!_hydrated || !data) return <div className="p-8 text-center text-ink-500">جاري التحميل...</div>;
  const s = data.stats;

  return (
    <div className="p-6 lg:p-8 space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">الداشبورد</h1>
          <p className="text-ink-500 text-sm">أهلاً {user?.name}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input text-sm" placeholder="من" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input text-sm" placeholder="إلى" />
          <button onClick={downloadExcel} className="btn-secondary text-sm"><FileDown className="w-4 h-4" /> Excel</button>
          <button onClick={downloadPDF} className="btn-secondary text-sm"><FileText className="w-4 h-4" /> PDF يومي</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={DollarSign} label="إيرادات اليوم" value={formatSAR(s.todayRevenue)} color="emerald" />
        <StatCard icon={ShoppingBag} label="طلبات اليوم" value={s.todayOrders} color="blue" />
        <StatCard icon={Users} label="العملاء" value={s.todayCustomers} color="purple" />
        <StatCard icon={Clock} label="طلبات معلقة" value={s.pendingOrders} color="amber" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SmallStat label="إيرادات الأسبوع" value={formatSAR(s.weekRevenue)} />
        <SmallStat label="إيرادات الشهر" value={formatSAR(s.monthRevenue)} />
        <SmallStat label="متوسط الطلب" value={formatSAR(s.todayOrders ? s.todayRevenue / s.todayOrders : 0)} />
        <SmallStat label="قيد الانتظار" value={s.pendingOrders} />
      </div>

      <div className="card p-6">
        <h2 className="font-semibold mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4" /> المبيعات — آخر 7 أيام</h2>
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer>
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} stroke="#64748b" fontSize={12} />
              <YAxis stroke="#64748b" fontSize={12} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }} />
              <Line type="monotone" dataKey="revenue" stroke="#dc2626" strokeWidth={2} dot={{ fill: '#dc2626' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2"><Package className="w-4 h-4" /> أعلى المنتجات (7 أيام)</h2>
          <div className="space-y-3">
            {data.topProducts.map((tp: any, i: number) => (
              <div key={tp.productId} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-ink-100 flex items-center justify-center text-lg">{tp.product?.image || '🍽️'}</div>
                <div className="flex-1 min-w-0 text-right">
                  <div className="text-sm font-medium truncate">{tp.product?.nameAr || tp.product?.name}</div>
                  <div className="text-xs text-ink-500">{tp._sum.quantity} قطعة مباعة</div>
                </div>
                <div className="text-sm font-semibold">{formatSAR((tp.product?.price || 0) * (tp._sum.quantity || 0))}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> تنبيه المخزون</h2>
          {data.lowStock.length === 0 ? (
            <p className="text-sm text-ink-500 text-center py-8">✅ كل الأصناف متوفرة</p>
          ) : (
            <div className="space-y-2">
              {data.lowStock.map((inv: any) => (
                <div key={inv.id} className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div>
                    <div className="text-sm font-medium">{inv.product.nameAr || inv.product.name}</div>
                    <div className="text-xs text-ink-500">الحد الأدنى: {inv.minStock} {inv.unit === 'pcs' ? 'قطعة' : inv.unit}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-amber-700">{inv.stock}</div>
                    <div className="text-xs text-ink-500">في المخزون</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: any) {
  const colors: any = {
    emerald: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-blue-50 text-blue-700',
    purple: 'bg-purple-50 text-purple-700',
    amber: 'bg-amber-50 text-amber-700',
  };
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <div className={`p-2 rounded-lg ${colors[color]}`}><Icon className="w-4 h-4" /></div>
      </div>
      <div className="text-xs text-ink-500">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}

function SmallStat({ label, value }: any) {
  return (
    <div className="bg-white rounded-xl border border-ink-200 p-4">
      <div className="text-xs text-ink-500">{label}</div>
      <div className="text-lg font-bold mt-1">{value}</div>
    </div>
  );
}
