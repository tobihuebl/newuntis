'use client';
import {
  ArrowLeftRight,
  BookOpenCheck,
  CalendarDays,
  ChartColumn,
  Ellipsis,
  GraduationCap,
  House,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  Upload,
  UserRound,
  UserRoundX,
  Users,
  LogOut,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@sp/ui';
import type { NavItem } from '@sp/shared';
import { apiPost } from '../lib/api-client';

const ICONS: Record<string, LucideIcon> = {
  house: House,
  'calendar-days': CalendarDays,
  'list-checks': ListChecks,
  'message-square': MessageSquare,
  'user-round': UserRound,
  'user-round-x': UserRoundX,
  'book-open-check': BookOpenCheck,
  users: Users,
  'graduation-cap': GraduationCap,
  'layout-dashboard': LayoutDashboard,
  'arrow-left-right': ArrowLeftRight,
  'chart-column': ChartColumn,
  ellipsis: Ellipsis,
  upload: Upload,
};

export interface AppShellProps {
  tabs: NavItem[];
  userName: string;
  roleLabels: string[];
  csrfToken: string;
  children: React.ReactNode;
}

export function AppShell({ tabs, userName, roleLabels, csrfToken, children }: AppShellProps) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const router = useRouter();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  async function logout() {
    await apiPost('/auth/logout', undefined, csrfToken).catch(() => undefined);
    router.replace('/login');
    router.refresh();
  }

  const link = (item: NavItem, layout: 'side' | 'tab') => {
    const Icon = ICONS[item.icon] ?? Ellipsis;
    const active = isActive(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex min-h-11 items-center gap-3 rounded-sm px-3 text-sm font-medium',
          layout === 'tab' && 'flex-1 flex-col justify-center gap-0.5 px-1 text-xs',
          active ? 'text-primary' : 'text-muted hover:text-text',
          layout === 'side' && active && 'bg-surface-2',
        )}
      >
        <Icon aria-hidden="true" size={layout === 'tab' ? 22 : 20} />
        <span>{t(item.labelKey)}</span>
      </Link>
    );
  };

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[16rem_1fr]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-surface focus:p-3"
      >
        {t('skip')}
      </a>
      <aside className="hidden border-r border-border bg-surface p-4 md:flex md:flex-col md:gap-4">
        <p className="px-3 text-lg font-semibold text-primary">Schulplattform</p>
        <nav aria-label={t('main')} className="flex flex-col gap-1">
          {tabs.map((i) => link(i, 'side'))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-col pb-16 md:pb-0">
        <header className="flex min-h-14 items-center justify-between gap-3 border-b border-border bg-surface px-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{userName}</p>
            <p className="truncate text-xs text-muted">{roleLabels.join(', ')}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-sm px-3 text-sm text-muted hover:bg-surface-2 hover:text-text"
          >
            <LogOut aria-hidden="true" size={18} />
            <span className="hidden sm:inline">{t('logout')}</span>
            <span className="sr-only sm:hidden">{t('logout')}</span>
          </button>
        </header>
        <div id="main" tabIndex={-1} className="min-w-0 flex-1">
          {children}
        </div>
      </div>
      <nav
        aria-label={t('main')}
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface md:hidden"
      >
        {tabs.map((i) => link(i, 'tab'))}
      </nav>
    </div>
  );
}
