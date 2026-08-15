'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { ChefHat, Lock, Mail, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuth();
  const [email, setEmail] = useState('admin@abo-zoelf.com');
  const [password, setPassword] = useState('admin123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/auth/login', { email, password });
      setAuth(data.token, data.user);
      if (data.user.role === 'KITCHEN') router.push('/kitchen');
      else if (data.user.role === 'CASHIER' || data.user.role === 'WAITER') router.push('/pos');
      else router.push('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'بيانات الدخول غير صحيحة');
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = (e: string, p: string) => { setEmail(e); setPassword(p); };

  return (
    <div className="min-h-screen flex" dir="rtl">
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 text-white p-12 flex-col justify-between">
        <div>
          <div className="flex items-center gap-3 mb-8">
            <div className="bg-white/20 backdrop-blur p-3 rounded-xl">
              <ChefHat className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">أبو الزلف</h1>
              <p className="text-brand-100 text-sm">نظام إدارة المطعم</p>
            </div>
          </div>
          <h2 className="text-4xl font-bold leading-tight mb-4">أدر مطعمك<br />زي المحترفين</h2>
          <p className="text-brand-100 text-lg max-w-md">كاشير سريع، مخزون، شاشة مطبخ، وتقارير لحظية — كل حاجة في مكان واحد.</p>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="bg-white/10 backdrop-blur rounded-xl p-4">
            <div className="text-2xl font-bold">⚡</div>
            <div className="mt-1 font-semibold">سرعة فائقة</div>
            <div className="text-brand-100">أوردرات في ثانية</div>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-xl p-4">
            <div className="text-2xl font-bold">📊</div>
            <div className="mt-1 font-semibold">تقارير لحظية</div>
            <div className="text-brand-100">داشبورد مباشر</div>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-xl p-4">
            <div className="text-2xl font-bold">🍳</div>
            <div className="mt-1 font-semibold">شاشة المطبخ</div>
            <div className="text-brand-100">KDS مباشر</div>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-xl p-4">
            <div className="text-2xl font-bold">📱</div>
            <div className="mt-1 font-semibold">تطبيق المالك</div>
            <div className="text-brand-100">في أي وقت وأي مكان</div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 bg-ink-50">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <ChefHat className="w-8 h-8 text-brand-600" />
            <span className="font-bold text-2xl">أبو الزلف</span>
          </div>
          <h2 className="text-3xl font-bold mb-2">مرحباً بعودتك</h2>
          <p className="text-ink-500 mb-8">سجّل دخول إلى نظام إدارة المطعم</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">البريد الإلكتروني</label>
              <div className="relative">
                <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="input pr-9 text-right" placeholder="you@restaurant.com" required />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">كلمة المرور</label>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  className="input pr-9 text-right" placeholder="••••••••" required />
              </div>
            </div>
            {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 text-right">{error}</div>}
            <button type="submit" disabled={loading} className="btn-primary w-full py-3">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> جاري الدخول...</> : 'تسجيل الدخول'}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-ink-200">
            <p className="text-xs text-ink-500 mb-3 font-medium text-right">دخول سريع (تجريبي)</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => quickLogin('admin@abo-zoelf.com', 'admin123')} className="btn-secondary text-xs">👑 المدير</button>
              <button onClick={() => quickLogin('cashier@abo-zoelf.com', 'cashier123')} className="btn-secondary text-xs">💰 الكاشير</button>
              <button onClick={() => quickLogin('kitchen@abo-zoelf.com', 'kitchen123')} className="btn-secondary text-xs">🍳 المطبخ</button>
              <button onClick={() => quickLogin('manager@abo-zoelf.com', 'admin123')} className="btn-secondary text-xs">📋 المدير</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
