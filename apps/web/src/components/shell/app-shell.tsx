'use client';
import { Ellipsis, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  moreSections,
  type NavCount,
  type NavItem,
  type NavSection,
  type PrincipalDashboard,
  type Role,
  type TodayResponse,
} from '@sp/shared';
import {
  Button,
  Logo,
  Sheet,
  Sidebar,
  TabBar,
  ToastProvider,
  cn,
  type LinkComponent,
  type NavEntry,
} from '@sp/ui';
import { useApi } from '../../lib/use-api';
import { NAV_ICONS } from '../nav-icons';
import { NotificationBell } from '../notifications/bell';
import { OfflineBanner, OfflineChip } from '../sync-status';
import { CommandPalette } from './command-palette';
import { MoreContent } from './more-content';
import { activeHref, allItems } from './nav-model';
import { useLogout } from './use-logout';

export interface AppShellProps {
  view: Role | null;
  tabs: NavItem[];
  sections: NavSection[];
  views: { role: Role; label: string; home: string }[];
  userName: string;
  roleLabel: string;
  schoolName: string;
  csrfToken: string;
  children: React.ReactNode;
}

/** Zähler aus vorhandenen Abfragen (kein eigener Endpunkt): offene Einträge, offene Supplierungen. */
function useNavCounts(view: Role | null): Partial<Record<NavCount, number>> {
  const teacher = view === 'TEACHER' || view === 'HOMEROOM';
  const school = view === 'PRINCIPAL' || view === 'ADMIN';
  const today = useApi<TodayResponse>(['today', 'nav'], teacher ? '/today' : null);
  const dash = useApi<PrincipalDashboard>(
    ['dashboard', 'nav'],
    school ? '/dashboard/principal' : null,
  );
  return {
    openEntries: today.data?.teacher?.openEntries,
    openSubstitutions: dash.data?.cards.openSubstitutions,
  };
}

const ShellContext = createContext<{ logout: () => void }>({ logout: () => undefined });
/** Abmelden aus Seiten innerhalb der Shell (z. B. /mehr); offene Änderungen fragt die Shell nach. */
export const useShell = () => useContext(ShellContext);

/**
 * App-Shell (Design System "Web und Mobile"): ab 1024 px Nacht-Seitenleiste und Topbar (Suche, Offline-Status,
 * Glocke, Profil), darunter Kopfzeile und Tab-Leiste mit erhobener Hauptaktion. Beides per CSS umgeschaltet,
 * nicht doppelt gemountet.
 */
export function AppShell({
  view,
  tabs,
  sections,
  views,
  userName,
  roleLabel,
  schoolName,
  csrfToken,
  children,
}: AppShellProps) {
  const t = useTranslations('nav');
  const to = useTranslations('offline');
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const [palette, setPalette] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [mac, setMac] = useState(false);
  const { logout, unsynced, cancel } = useLogout(csrfToken);
  const counts = useNavCounts(view);
  // Ungelesene Nachrichten und Rundschreiben (aktualisiert über den Echtzeit-Stream)
  const inbox = useApi<{ messages: number; announcements: number }>(['inbox'], '/threads/unread');
  const unread = (inbox.data?.messages ?? 0) + (inbox.data?.announcements ?? 0);

  const items = useMemo(() => allItems(tabs, sections), [tabs, sections]);
  const active = activeHref(
    pathname,
    items.map((i) => i.href),
  );
  const title = items.find((i) => i.href === active);

  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  const entry = (i: NavItem): NavEntry => {
    const count = i.count ? counts[i.count] : undefined;
    return {
      key: i.href,
      label: t(i.labelKey),
      icon: NAV_ICONS[i.icon] ?? Ellipsis,
      href: i.href === '/mehr' ? undefined : i.href,
      onSelect: i.href === '/mehr' ? () => setMore(true) : undefined,
      active: i.href === '/mehr' ? more : i.href === active,
      primary: i.primary,
      count: count || undefined,
      countLabel: count ? t('countOpen', { count }) : undefined,
      dot: i.href === '/nachrichten' && unread > 0 ? t('unread', { count: unread }) : undefined,
    };
  };

  return (
    <ShellContext.Provider value={{ logout: () => void logout() }}>
      <ToastProvider>
        <div className="min-h-dvh lg:grid lg:grid-cols-[var(--sidebar-w)_minmax(0,1fr)]">
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-toast focus:rounded-md focus:bg-bg-raised focus:p-3"
          >
            {t('skip')}
          </a>

          <div className="sticky top-0 hidden h-dvh p-3 pr-0 lg:block">
            <Sidebar
              className="h-full w-full overflow-y-auto"
              ariaLabel={t('main')}
              linkAs={Link as LinkComponent}
              brand={<Logo onNight size="sm" />}
              sections={sections.map((s) => ({
                label: s.labelKey ? t(s.labelKey) : undefined,
                items: s.items.map(entry),
              }))}
            />
          </div>

          <div className="flex min-w-0 flex-col pb-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] lg:pb-0">
            <header
              className={cn(
                'sticky top-0 z-nav flex min-h-(--topbar-h) items-center gap-3 bg-bg px-4 pt-[env(safe-area-inset-top)] transition-[border-color] lg:px-6',
                'border-b',
                scrolled ? 'border-line' : 'border-transparent',
              )}
            >
              {/* Mobil: Titel des Bereichs, rechts eine Aktion */}
              <p
                className={cn(
                  'min-w-0 flex-1 truncate font-heading transition-all duration-150 lg:hidden',
                  scrolled ? 'text-h3' : 'text-h2',
                )}
              >
                {title ? t(title.labelKey) : <Logo size="sm" />}
              </p>
              {/* Web: Suche, Offline-Status, Glocke, Profil */}
              <button
                type="button"
                onClick={() => setPalette(true)}
                className="hidden min-h-(--tap-min) w-full max-w-sm items-center gap-3 rounded-md bg-bg-raised px-4 text-body-sm text-ink-muted ring-control hover:text-ink lg:flex"
              >
                <Search aria-hidden="true" className="size-4" />
                <span className="flex-1 text-left">{t('search')}</span>
                <kbd className="text-mono-sm text-ink-subtle">
                  {mac ? t('searchShortcutMac') : t('searchShortcut')}
                </kbd>
              </button>
              <div className="ml-auto flex items-center gap-2">
                <span className="hidden lg:inline-flex">
                  <OfflineChip />
                </span>
                <NotificationBell />
                <button
                  type="button"
                  onClick={() => setMore(true)}
                  aria-label={t('openMenu')}
                  className="hidden min-h-(--tap-min) items-center gap-3 rounded-md px-2 text-left hover:bg-brand-soft lg:flex"
                >
                  <span className="pf-att__avatar bg-brand-soft" aria-hidden="true">
                    {userName.slice(0, 1)}
                  </span>
                  <span className="flex max-w-48 flex-col">
                    <span className="truncate text-label">{userName}</span>
                    <span className="truncate text-caption text-ink-muted">
                      {roleLabel} · {schoolName}
                    </span>
                  </span>
                </button>
              </div>
            </header>
            <OfflineBanner />
            <main id="main" tabIndex={-1} className="min-w-0 flex-1 outline-none">
              {children}
            </main>
          </div>

          <TabBar
            className="fixed inset-x-0 bottom-0 z-nav h-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] pb-[calc(var(--space-2)+env(safe-area-inset-bottom))] lg:hidden"
            ariaLabel={t('main')}
            linkAs={Link as LinkComponent}
            items={tabs.map(entry)}
          />

          <Sheet open={more} onOpenChange={setMore} title={t('moreTitle')} closeLabel={t('close')}>
            <MoreContent
              sections={moreSections({ view, tabs, sections, home: '', allowedRoutes: [] })}
              views={views}
              view={view}
              userName={userName}
              roleLabel={roleLabel}
              schoolName={schoolName}
              onNavigate={() => setMore(false)}
              onLogout={() => {
                setMore(false);
                void logout();
              }}
            />
          </Sheet>

          <CommandPalette open={palette} onOpenChange={setPalette} items={items} />

          <Sheet
            open={unsynced > 0}
            onOpenChange={(o) => (o ? undefined : cancel())}
            title={to('logoutPendingTitle')}
            description={to('logoutPendingText', { count: unsynced })}
            closeLabel={to('stay')}
          >
            <div className="flex flex-wrap gap-3">
              <Button variant="danger" onClick={() => void logout(true)}>
                {to('logoutAnyway')}
              </Button>
              <Button variant="secondary" onClick={cancel}>
                {to('stay')}
              </Button>
            </div>
          </Sheet>
        </div>
      </ToastProvider>
    </ShellContext.Provider>
  );
}
