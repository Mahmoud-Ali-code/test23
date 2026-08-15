/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
        },
        ink: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  // P2.4: safelist dynamic color classes that come from runtime strings
  // (e.g. customers page uses `bg-${color}-50` from a const object). Without
  // this safelist, Tailwind JIT prunes them and the styles don't render.
  safelist: [
    'bg-emerald-50', 'bg-emerald-100', 'bg-emerald-200', 'text-emerald-600', 'text-emerald-700', 'text-emerald-800', 'border-emerald-200',
    'bg-blue-50', 'bg-blue-100', 'bg-blue-200', 'text-blue-600', 'text-blue-700', 'text-blue-800', 'border-blue-200',
    'bg-amber-50', 'bg-amber-100', 'bg-amber-200', 'text-amber-600', 'text-amber-700', 'text-amber-800', 'border-amber-200',
    'bg-red-50', 'bg-red-100', 'bg-red-200', 'text-red-600', 'text-red-700', 'text-red-800', 'border-red-200',
    'bg-purple-50', 'bg-purple-100', 'bg-purple-200', 'text-purple-600', 'text-purple-700', 'text-purple-800', 'border-purple-200',
    'bg-ink-50', 'bg-ink-100', 'bg-ink-200', 'text-ink-500', 'text-ink-600', 'text-ink-700', 'text-ink-800', 'border-ink-200', 'border-ink-100',
  ],
  plugins: [],
};
