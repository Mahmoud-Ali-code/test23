import axios from 'axios';

const API_URL = typeof window !== 'undefined'
  ? '/api'
  : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api`;

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      const path = window.location.pathname;
      if (path !== '/login') {
        // Clear the zustand auth store too — otherwise the next page render
        // sees a stale `token` in the persisted state and skips the /login redirect.
        try {
          // Lazy import to avoid a circular dep at module load time
          const { useAuth } = require('@/store/auth');
          useAuth.getState().logout();
        } catch {
          // Fallback: manual cleanup if the store import fails for any reason
          localStorage.removeItem('token');
          localStorage.removeItem('foodics-auth');
        }
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export const formatSAR = (n: number) => `${(n || 0).toFixed(2)} EGP`;
export const formatDate = (d: string) => new Date(d).toLocaleString();
export const formatDateShort = (d: string) => new Date(d).toLocaleDateString();

/**
 * Download a file from the API with the current auth token.
 * Used for PDF/CSV exports where we want the browser to handle the download directly.
 * Returns the blob (you can also just let the browser handle it via <a download>).
 */
export async function downloadFile(path: string, filename?: string): Promise<void> {
  if (typeof window === 'undefined') return;
  const token = localStorage.getItem('token');
  const url = path.startsWith('http') ? path : `/api${path.startsWith('/') ? path : '/' + path}`;
  const r = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!r.ok) {
    let msg = `فشل التحميل (${r.status})`;
    try { const j = await r.json(); if (j?.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  const b = await r.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = filename || path.split('/').pop() || 'download';
  a.click();
  URL.revokeObjectURL(a.href);
}
