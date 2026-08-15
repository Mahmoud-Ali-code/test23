'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { ChefHat, Clock, Check, RotateCw, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function KitchenPage() {
  const router = useRouter();
  const { user, token, logout, _hydrated } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    if (!_hydrated || !token) return;
    load();
    const i = setInterval(load, 5000);
    return () => clearInterval(i);
  }, [token, _hydrated]);

  const load = async () => {
    try {
      const r = await api.get('/orders?status=CONFIRMED,PREPARING,READY');
      setOrders(r.data.orders);
    } catch {}
  };

  const updateStatus = async (id: string, status: string) => {
    await api.patch(`/orders/${id}/status`, { status });
    load();
  };

  const elapsed = (date: string) => {
    const ms = Date.now() - new Date(date).getTime();
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const typeLabel = (t: string) => {
    if (t === 'DINE_IN') return '🍽️ صالة';
    if (t === 'TAKEAWAY') return '🛍️ تيك أواي';
    if (t === 'DELIVERY') return '🚚 توصيل';
    return t;
  };

  const active = orders.filter((o) => o.status === 'CONFIRMED' || o.status === 'PREPARING');
  const ready = orders.filter((o) => o.status === 'READY');

  return (
    <div className="min-h-screen bg-ink-900 text-white">
      <header className="bg-ink-800 border-b border-ink-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-brand-600 p-2 rounded-lg"><ChefHat className="w-6 h-6" /></div>
          <div>
            <h1 className="text-xl font-bold">أبو الزلف — المطبخ</h1>
            <div className="text-xs text-ink-400">نشط: {active.length} • جاهز: {ready.length}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-ink-400">{user?.name}</div>
          <button onClick={() => { logout(); router.push('/login'); }} className="btn-ghost text-ink-300"><LogOut className="w-4 h-4" /></button>
        </div>
      </header>

      <div className="p-6">
        {active.length === 0 && ready.length === 0 ? (
          <div className="text-center py-32 text-ink-500">
            <div className="text-6xl mb-4">👨‍🍳</div>
            <p className="text-xl">لا توجد طلبات نشطة</p>
            <p className="text-sm mt-2">الطلبات الجديدة ستظهر هنا تلقائياً</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[...active, ...ready].map((o) => {
              const urgent = (Date.now() - new Date(o.createdAt).getTime()) > 10 * 60 * 1000;
              return (
                <div key={o.id} className={`rounded-2xl p-4 ${o.status === 'READY' ? 'bg-emerald-900/40 border-2 border-emerald-500' : urgent ? 'bg-red-900/40 border-2 border-red-500' : 'bg-ink-800 border border-ink-700'}`}>
                  <div className="flex items-center justify-between mb-3 pb-3 border-b border-ink-700">
                    <div>
                      <div className="font-bold text-lg">#{o.orderNumber.split('-').pop()}</div>
                      <div className="text-xs text-ink-400">{typeLabel(o.type)}</div>
                    </div>
                    <div className={`text-2xl font-mono font-bold ${urgent ? 'text-red-400 animate-pulse' : 'text-ink-300'}`}>
                      <Clock className="w-4 h-4 inline mr-1" />{elapsed(o.createdAt)}
                    </div>
                  </div>
                  {o.table && <div className="text-sm text-ink-300 mb-2">🪑 طاولة {o.table.number}</div>}
                  {o.customerName && <div className="text-sm text-ink-300 mb-1">👤 {o.customerName}</div>}
                  {o.customerPhone && <div className="text-sm text-ink-300 mb-1">📞 {o.customerPhone}</div>}
                  {o.notes && <div className="text-xs bg-amber-900/30 border border-amber-700 rounded p-2 mb-3 text-amber-200">📝 {o.notes}</div>}
                  <div className="space-y-2">
                    {o.items.map((it: any) => (
                      <div key={it.id} className="flex items-start gap-2 bg-ink-900/50 rounded p-2">
                        <div className="text-2xl">{it.product.image || '🍽️'}</div>
                        <div className="flex-1">
                          <div className="font-semibold">{it.product.nameAr || it.product.name}</div>
                          <div className="text-xs text-ink-400">× {it.quantity}</div>
                          {it.notes && <div className="text-xs text-amber-300 mt-1">⚠️ {it.notes}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex gap-2">
                    {o.status === 'CONFIRMED' && (
                      <button onClick={() => updateStatus(o.id, 'PREPARING')} className="flex-1 bg-amber-600 hover:bg-amber-700 rounded-lg py-2 font-semibold flex items-center justify-center gap-1">
                        <RotateCw className="w-4 h-4" /> بدء التحضير
                      </button>
                    )}
                    {o.status === 'PREPARING' && (
                      <button onClick={() => updateStatus(o.id, 'READY')} className="flex-1 bg-emerald-600 hover:bg-emerald-700 rounded-lg py-2 font-semibold flex items-center justify-center gap-1">
                        <Check className="w-4 h-4" /> جاهز
                      </button>
                    )}
                    {o.status === 'READY' && (
                      <button onClick={() => updateStatus(o.id, 'SERVED')} className="flex-1 bg-blue-600 hover:bg-blue-700 rounded-lg py-2 font-semibold flex items-center justify-center gap-1">
                        <Check className="w-4 h-4" /> تم التقديم
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
