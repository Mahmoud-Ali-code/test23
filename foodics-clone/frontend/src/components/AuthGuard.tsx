'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';

export function useAuthGuard() {
  const router = useRouter();
  const { token, user, _hydrated } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!_hydrated) return;
    if (!token) { router.push('/login'); return; }
    setReady(true);
  }, [_hydrated, token, router]);

  return { ready, user, token };
}
