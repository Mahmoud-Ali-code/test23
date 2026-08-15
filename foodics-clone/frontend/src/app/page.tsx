'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';

export default function HomePage() {
  const router = useRouter();
  const { token, user } = useAuth();
  useEffect(() => {
    if (!token) router.push('/login');
    else if (user?.role === 'KITCHEN') router.push('/kitchen');
    else if (user?.role === 'CASHIER' || user?.role === 'WAITER') router.push('/pos');
    else router.push('/dashboard');
  }, [token, user, router]);
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-ink-500">Loading...</div>
    </div>
  );
}
