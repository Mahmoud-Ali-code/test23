import type { Metadata, Viewport } from 'next';
import './globals.css';
import ToastContainer from '@/components/Toast';

// Demo banner is shown when this is set. The customer sees a clear
// "this is a test, not production" indicator at the top of every page.
// Toggle off (and rebuild) before going live.
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
const DEMO_LABEL = process.env.NEXT_PUBLIC_DEMO_LABEL || 'TEST DEMO';
const DEMO_HINT = process.env.NEXT_PUBLIC_DEMO_HINT || 'تجريبي — البيانات للعرض فقط';

export const metadata: Metadata = {
  title: DEMO_MODE ? `${DEMO_LABEL} · أبو الزلف` : 'أبو الزلف - نظام إدارة المطعم',
  description: 'نظام إدارة مطعم أبو الزلف - كاشير، مطبخ، مخزون، وتقارير',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#dc2626',
};

function DemoBanner() {
  if (!DEMO_MODE) return null;
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 9999,
        background: 'linear-gradient(90deg, #dc2626 0%, #b91c1c 100%)',
        color: '#fff',
        padding: '8px 16px',
        textAlign: 'center',
        fontWeight: 700,
        fontSize: 14,
        letterSpacing: 0.3,
        boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
      }}
    >
      <span style={{ marginInlineEnd: 8 }}>🧪</span>
      {DEMO_LABEL} — {DEMO_HINT}
      <span style={{ marginInlineStart: 8 }}>🧪</span>
    </div>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen" style={{ fontFamily: "'Cairo', system-ui, -apple-system, sans-serif" }}>
        <DemoBanner />
        {children}
        <ToastContainer />
      </body>
    </html>
  );
}
