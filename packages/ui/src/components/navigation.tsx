import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../cn';

/** Eintrag der Navigation (Design System, Navigation): Icon, ein Wort, Ziel, optional Zähler. */
export interface NavEntry {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Ziel; ohne href wird der Eintrag ein Button (z. B. "Mehr" öffnet ein Sheet). */
  href?: string;
  onSelect?: () => void;
  active?: boolean;
  /** Hauptaktion der Rolle (nur Tab-Leiste): Amber-Taste in der Mitte. */
  primary?: boolean;
  /** Amber-Zähler, nur für Dinge mit Frist (offene Einträge, Supplierungen). */
  count?: number;
  /** Punkt für Ungelesenes, mit Text für Screenreader. */
  dot?: string;
  /** Text für Screenreader zum Zähler, z. B. "3 offen". */
  countLabel?: string;
}

export interface NavSectionEntry {
  label?: string;
  items: NavEntry[];
}

/** Link-Komponente der App (next/link); das UI-Paket kennt Next nicht. */
export type LinkComponent = React.ElementType<{
  href: string;
  className?: string;
  children?: React.ReactNode;
  'aria-current'?: 'page';
  'aria-label'?: string;
}>;

function Entry({
  entry,
  className,
  linkAs: LinkAs,
  children,
}: {
  entry: NavEntry;
  className: string;
  linkAs: LinkComponent;
  children: React.ReactNode;
}) {
  if (entry.href) {
    return (
      <LinkAs
        href={entry.href}
        className={className}
        aria-current={entry.active ? 'page' : undefined}
      >
        {children}
      </LinkAs>
    );
  }
  return (
    <button type="button" className={className} onClick={entry.onSelect}>
      {children}
    </button>
  );
}

function ScreenReaderExtras({ entry }: { entry: NavEntry }) {
  return (
    <>
      {entry.count ? <span className="sr-only">, {entry.countLabel ?? entry.count}</span> : null}
      {entry.dot ? <span className="sr-only">, {entry.dot}</span> : null}
    </>
  );
}

export interface SidebarProps {
  brand: React.ReactNode;
  sections: NavSectionEntry[];
  linkAs: LinkComponent;
  ariaLabel: string;
  className?: string;
}

/** Seitenleiste ab 1024 px (pf-nav): Nachtfläche mit Wortmarke, aktiver Punkt Kobalt, Abschnitt "Schule". */
export function Sidebar({ brand, sections, linkAs, ariaLabel, className }: SidebarProps) {
  return (
    <nav aria-label={ariaLabel} className={cn('pf-nav', className)}>
      <div className="pf-nav__brand">{brand}</div>
      {sections.map((sec, i) => (
        <React.Fragment key={sec.label ?? i}>
          {sec.label ? <p className="pf-nav__label">{sec.label}</p> : null}
          {sec.items.map((e) => {
            const Icon = e.icon;
            return (
              <Entry key={e.key} entry={e} linkAs={linkAs} className="pf-nav__item">
                <Icon aria-hidden="true" />
                <span className="min-w-0 flex-1">{e.label}</span>
                {e.count ? (
                  <span className="pf-nav__count" aria-hidden="true">
                    {e.count}
                  </span>
                ) : e.dot ? (
                  <span aria-hidden="true" className="ml-auto size-2.5 rounded-pill bg-signal" />
                ) : null}
                <ScreenReaderExtras entry={e} />
              </Entry>
            );
          })}
        </React.Fragment>
      ))}
    </nav>
  );
}

export interface TabBarProps {
  items: NavEntry[];
  linkAs: LinkComponent;
  ariaLabel: string;
  className?: string;
}

/** Tab-Leiste mobil (pf-tabbar): fünf Tabs, die Hauptaktion in der Mitte als erhobene Amber-Taste. */
export function TabBar({ items, linkAs, ariaLabel, className }: TabBarProps) {
  return (
    <nav aria-label={ariaLabel} className={cn('pf-tabbar', className)}>
      {items.map((e) => {
        const Icon = e.icon;
        return (
          <Entry
            key={e.key}
            entry={e}
            linkAs={linkAs}
            className={cn('pf-tab pf-focusable', e.primary && 'pf-tab--primary')}
          >
            <span className="pf-tab__icon relative">
              <Icon aria-hidden="true" />
              {e.count ? (
                <span className="pf-nav__count absolute -top-1 right-1" aria-hidden="true">
                  {e.count}
                </span>
              ) : e.dot ? (
                <span
                  aria-hidden="true"
                  className="absolute top-0.5 right-3 size-2.5 rounded-pill bg-signal ring-2 ring-bg-raised"
                />
              ) : null}
            </span>
            {/* Beschriftung als letztes Kind: bundle.css färbt .pf-tab--primary span:last-child */}
            <span>
              {e.label}
              <ScreenReaderExtras entry={e} />
            </span>
          </Entry>
        );
      })}
    </nav>
  );
}
