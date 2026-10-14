'use client';
import { ChevronRight, LifeBuoy, LogOut, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { NavSection, Role } from '@sp/shared';
import { Button, SegmentedControl } from '@sp/ui';
import { applyTheme, readTheme, type Theme } from '../../lib/theme';
import { setRoleView } from '../../lib/role-view';
import { NAV_ICONS } from '../nav-icons';
import { InstallHint } from './install-hint';
import { useT } from '../../lib/i18n';

export interface MoreContentProps {
  /** Seiten der Rolle, die nicht in der Tab-Leiste stehen. */
  sections: NavSection[];
  /** Ansichten bei mehreren Rollen (mit Beschriftung), sonst leer. */
  views: { role: Role; label: string; home: string }[];
  view: Role | null;
  userName: string;
  roleLabel: string;
  schoolName: string;
  onNavigate?: () => void;
  onLogout: () => void;
}

/**
 * Inhalt von "Mehr" (Design System, Mehr-Sheet): weitere Seiten der Rolle, Profil, Rolle wechseln, Darstellung,
 * Abmelden. Mobil als Sheet aus der Tab-Leiste, am Desktop über das Profil-Menü, dazu als Seite /mehr.
 */
export function MoreContent({
  sections,
  views,
  view,
  userName,
  roleLabel,
  schoolName,
  onNavigate,
  onLogout,
}: MoreContentProps) {
  const t = useT('nav');
  const tp = useT('profile');
  const router = useRouter();
  const [theme, setTheme] = useState<Theme>('system');
  useEffect(() => setTheme(readTheme()), []);

  return (
    <div className="flex flex-col gap-6">
      <InstallHint variant="more" />
      {sections.map((sec, i) => (
        <section key={sec.labelKey ?? i} className="flex flex-col gap-1">
          {sec.labelKey ? (
            <h3 className="px-1 pb-1 text-overline text-brand-text">{t(sec.labelKey)}</h3>
          ) : null}
          <ul className="flex flex-col">
            {sec.items.map((item) => {
              const Icon = NAV_ICONS[item.icon];
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className="flex min-h-(--tap-comfort) items-center gap-3 rounded-md px-3 text-label hover:bg-brand-soft"
                  >
                    {Icon ? <Icon aria-hidden="true" className="size-5 text-brand-text" /> : null}
                    <span className="flex-1">{t(item.labelKey)}</span>
                    <ChevronRight aria-hidden="true" className="size-4 text-ink-subtle" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <section className="flex flex-col gap-3">
        <h3 className="px-1 text-overline text-brand-text">{t('account')}</h3>
        <Link
          href="/profil"
          onClick={onNavigate}
          className="flex min-h-14 items-center gap-3 rounded-md px-3 hover:bg-brand-soft"
        >
          <span className="pf-att__avatar bg-brand-soft" aria-hidden="true">
            {userName.slice(0, 1)}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-body-strong">{userName}</span>
            <span className="truncate text-body-sm text-ink-muted">
              {roleLabel} · {schoolName}
            </span>
          </span>
          <UserRound aria-hidden="true" className="size-5 text-brand-text" />
          <span className="sr-only">{t('profil')}</span>
        </Link>
        {views.length > 1 ? (
          <SegmentedControl
            label={t('roleSwitch')}
            value={view ?? views[0]!.role}
            options={views.map((v) => ({ value: v.role, label: v.label }))}
            onChange={(role) => {
              setRoleView(role);
              onNavigate?.();
              router.push(views.find((v) => v.role === role)?.home ?? '/');
              router.refresh();
            }}
          />
        ) : null}
        <SegmentedControl
          label={t('theme')}
          value={theme}
          onChange={(v) => {
            setTheme(v);
            applyTheme(v);
          }}
          options={[
            { value: 'system', label: tp('themes.system') },
            { value: 'light', label: tp('themes.light') },
            { value: 'dark', label: tp('themes.dark') },
          ]}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" iconLeft={LogOut} onClick={onLogout}>
            {t('logout')}
          </Button>
          {/* Onboarding (ADR 0020): Einführung jederzeit wiederholen */}
          <Button variant="ghost" iconLeft={LifeBuoy} asChild>
            <Link href="/willkommen?wiederholen" onClick={onNavigate}>
              {t('help')}
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
