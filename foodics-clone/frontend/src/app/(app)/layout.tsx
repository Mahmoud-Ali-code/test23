'use client';
import Sidebar from '@/components/Sidebar';
import { useAuth } from '@/store/auth';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { token, user, _hydrated } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!_hydrated) return;
    if (!token) {
      router.push('/login');
    }
  }, [_hydrated, token, router]);

  if (!_hydrated) {
    return <div className="h-screen flex items-center justify-center text-ink-500">جاري التحميل...</div>;
  }
  if (!token) {
    return null;
  }

  // All pages get the sidebar now — it's collapsible so POS/Kitchen can use the space
  return <Sidebar>{children}</Sidebar>;
}
