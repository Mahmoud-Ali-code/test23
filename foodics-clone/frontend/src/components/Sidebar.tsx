'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import { useEffect, useState } from 'react';
import {
  ChefHat, LayoutDashboard, ShoppingCart, Utensils, Package, Users,
  BarChart3, Settings, LogOut, Store, Tag, ClipboardList, ScrollText, Truck, Bike,
  PanelLeftClose, PanelLeftOpen, Clock, Shield, Webhook, Inbox,
} from 'lucide-react';
import { clsx } from 'clsx';

const navItems = [
  { href: '/dashboard', label: 'الداشبورد', icon: LayoutDashboard, roles: ['ADMIN', 'MANAGER'] },
  { href: '/pos', label: 'الكاشير', icon: ShoppingCart, roles: ['ADMIN', 'MANAGER', 'CASHIER', 'WAITER'] },
  { href: '/shifts', label: 'الشيفتات', icon: Clock, roles: ['ADMIN', 'MANAGER', 'CASHIER'] },
  { href: '/orders', label: 'الطلبات', icon: ClipboardList, roles: ['ADMIN', 'MANAGER', 'CASHIER'] },
  { href: '/kitchen', label: 'شاشة المطبخ', icon: Utensils, roles: ['ADMIN', 'MANAGER', 'KITCHEN'] },
  { href: '/menu', label: 'القائمة', icon: Tag, roles: ['ADMIN', 'MANAGER'] },
  { href: '/inventory', label: 'المخزون', icon: Package, roles: ['ADMIN', 'MANAGER'] },
  { href: '/suppliers', label: 'الموردين والفواتير', icon: Truck, roles: ['ADMIN', 'MANAGER'] },
  { href: '/expenses', label: 'المصروفات', icon: ScrollText, roles: ['ADMIN', 'MANAGER'] },
  { href: '/customers', label: 'العملاء', icon: Users, roles: ['ADMIN', 'MANAGER', 'CASHIER'] },
  { href: '/aggregator-orders', label: 'طلبات المنصات', icon: Inbox, roles: ['ADMIN', 'MANAGER', 'CASHIER'] },
  { href: '/aggregators', label: 'منصات التوصيل', icon: Webhook, roles: ['ADMIN'] },
  { href: '/delivery', label: 'خدمات التوصيل', icon: Bike, roles: ['ADMIN', 'MANAGER'] },
  { href: '/tables', label: 'الطاولات', icon: Store, roles: ['ADMIN', 'MANAGER', 'CASHIER'] },
  { href: '/reports', label: 'التقارير', icon: BarChart3, roles: ['ADMIN', 'MANAGER'] },
  { href: '/audit', label: 'سجل التدقيق', icon: Shield, roles: ['ADMIN', 'MANAGER'] },
  { href: '/users', label: 'الموظفين', icon: Users, roles: ['ADMIN', 'MANAGER'] },
  { href: '/settings', label: 'الإعدادات', icon: Settings, roles: ['ADMIN'] },
];

const LS_KEY = 'sidebar_collapsed';

export default function Sidebar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved !== null) setCollapsed(saved === '1');
    } catch {}
    setHydrated(true);
  }, []);

  // Persist changes
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(LS_KEY, collapsed ? '1' : '0'); } catch {}
  }, [collapsed, hydrated]);

  const items = navItems.filter((i) => i.roles.includes(user.role));
  const sidebarWidth = collapsed ? 'w-16' : 'w-64';
  // Brand link goes to the first route the user is allowed to visit
  const homeHref = items[0]?.href ?? '/pos';

  return (
    <div className="flex h-screen bg-ink-50">
      <aside className={clsx(
        'bg-white border-l border-ink-200 flex flex-col flex-shrink-0 transition-[width] duration-200',
        sidebarWidth,
      )}>
        {/* Brand + toggle */}
        <div className="h-16 border-b border-ink-200 flex items-center px-3 gap-2 flex-shrink-0">
          {!collapsed && (
            <Link href={homeHref} className="flex items-center gap-2 flex-1 min-w-0">
              <div className="bg-brand-600 p-2 rounded-lg flex-shrink-0">
                <ChefHat className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-base truncate">أبو الزلف</div>
                <div className="text-[10px] text-ink-500 truncate">نظام إدارة المطعم</div>
              </div>
            </Link>
          )}
          {collapsed && (
            <Link href={homeHref} className="flex-1 flex justify-center" title="أبو الزلف">
              <div className="bg-brand-600 p-2 rounded-lg">
                <ChefHat className="w-5 h-5 text-white" />
              </div>
            </Link>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="p-1.5 rounded-lg hover:bg-ink-100 text-ink-500 hover:text-ink-700 flex-shrink-0"
            title={collapsed ? 'إظهار القائمة' : 'إخفاء القائمة'}
          >
            {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-1">
          {items.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link key={item.href} href={item.href} title={collapsed ? item.label : undefined}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition',
                  active ? 'bg-brand-50 text-brand-700 font-semibold' : 'text-ink-600 hover:bg-ink-100',
                  collapsed && 'justify-center px-2',
                )}>
                <Icon className="w-4 h-4 flex-shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="p-2 border-t border-ink-200">
          <div className={clsx('flex items-center gap-2 p-2', collapsed ? 'justify-center' : '')}>
            {collapsed ? (
              // When collapsed, show a single logout button in place of the avatar
              <button
                onClick={() => { logout(); router.push('/login'); }}
                className="w-9 h-9 rounded-lg bg-brand-100 text-brand-700 hover:bg-red-50 hover:text-red-600 flex items-center justify-center flex-shrink-0 transition"
                title={`${user.name} - تسجيل خروج`}
              >
                <LogOut className="w-4 h-4" />
              </button>
            ) : (
              <>
                <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-semibold text-sm flex-shrink-0">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{user.name}</div>
                  <div className="text-xs text-ink-500">
                    {user.role === 'ADMIN' ? 'مدير عام'
                      : user.role === 'MANAGER' ? 'مدير'
                      : user.role === 'CASHIER' ? 'كاشير'
                      : user.role === 'WAITER' ? 'ويتر'
                      : user.role === 'KITCHEN' ? 'مطبخ'
                      : 'موظف'}
                  </div>
                </div>
                <button onClick={() => { logout(); router.push('/login'); }}
                  className="p-2 text-ink-500 hover:text-red-600 hover:bg-red-50 rounded-lg" title="تسجيل خروج">
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto min-w-0">{children}</main>
    </div>
  );
}
