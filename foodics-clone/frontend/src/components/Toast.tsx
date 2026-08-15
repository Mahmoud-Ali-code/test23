'use client';
import { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';
interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration: number;
}

type Listener = (toasts: Toast[]) => void;
let toasts: Toast[] = [];
const listeners = new Set<Listener>();

const push = (toast: Toast) => {
  toasts = [...toasts, toast];
  listeners.forEach((l) => l(toasts));
  if (toast.duration > 0) {
    setTimeout(() => remove(toast.id), toast.duration);
  }
};

const remove = (id: string) => {
  toasts = toasts.filter((t) => t.id !== id);
  listeners.forEach((l) => l(toasts));
};

/** Public API: call these from anywhere in the app. */
export const toast = {
  success: (title: string, message?: string, duration = 3500) => push({ id: crypto.randomUUID(), type: 'success', title, message, duration }),
  error:   (title: string, message?: string, duration = 5000) => push({ id: crypto.randomUUID(), type: 'error', title, message, duration }),
  warning: (title: string, message?: string, duration = 4000) => push({ id: crypto.randomUUID(), type: 'warning', title, message, duration }),
  info:    (title: string, message?: string, duration = 3500) => push({ id: crypto.randomUUID(), type: 'info', title, message, duration }),
  dismiss: remove,
};

const ICONS: Record<ToastType, any> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const COLORS: Record<ToastType, string> = {
  success: 'bg-emerald-50 border-emerald-300 text-emerald-900',
  error: 'bg-red-50 border-red-300 text-red-900',
  warning: 'bg-amber-50 border-amber-300 text-amber-900',
  info: 'bg-blue-50 border-blue-300 text-blue-900',
};

const ICON_COLORS: Record<ToastType, string> = {
  success: 'text-emerald-600',
  error: 'text-red-600',
  warning: 'text-amber-600',
  info: 'text-blue-600',
};

/**
 * Mounts the global toast container. Add <ToastContainer /> once at the app root.
 * Toasts auto-dismiss after their `duration`. Users can also click the X to
 * close manually.
 */
export default function ToastContainer() {
  const [list, setList] = useState<Toast[]>([]);
  useEffect(() => {
    const l: Listener = (t) => setList(t);
    listeners.add(l);
    setList(toasts);
    return () => { listeners.delete(l); };
  }, []);
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 pointer-events-none" dir="rtl">
      {list.map((t) => {
        const Icon = ICONS[t.type];
        return (
          <div
            key={t.id}
            className={`pointer-events-auto min-w-[280px] max-w-md rounded-xl border shadow-lg px-4 py-3 flex items-start gap-2 animate-in fade-in slide-in-from-top-2 ${COLORS[t.type]}`}
            role="alert"
          >
            <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${ICON_COLORS[t.type]}`} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">{t.title}</div>
              {t.message && <div className="text-xs mt-0.5 opacity-90">{t.message}</div>}
            </div>
            <button
              onClick={() => remove(t.id)}
              className="p-1 hover:bg-black/5 rounded flex-shrink-0"
              aria-label="إغلاق"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
