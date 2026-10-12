/** Navigation je Rolle (docs/spec.md Abschnitt 5). Mobil höchstens 5 Tabs, Desktop Seitenleiste. */
import type { Role } from './constants';

export interface NavItem {
  /** Schlüssel in messages/*.json unter "nav". */
  labelKey: string;
  href: string;
  /** Name eines Lucide-Icons (kebab-case). */
  icon: string;
}

interface RoleNav {
  home: string;
  tabs: NavItem[];
  /** Weitere erlaubte Routen (Muster mit [param]), die nicht als Tab erscheinen. */
  routes: string[];
}

const heute: NavItem = { labelKey: 'heute', href: '/heute', icon: 'house' };
const plan: NavItem = { labelKey: 'plan', href: '/plan', icon: 'calendar-days' };
const nachrichten: NavItem = {
  labelKey: 'nachrichten',
  href: '/nachrichten',
  icon: 'message-square',
};
const profil: NavItem = { labelKey: 'profil', href: '/profil', icon: 'user-round' };
const mehr: NavItem = { labelKey: 'mehr', href: '/mehr', icon: 'ellipsis' };

const NAV: Record<Role, RoleNav> = {
  STUDENT: {
    home: '/heute',
    tabs: [
      heute,
      plan,
      { labelKey: 'aufgaben', href: '/aufgaben', icon: 'list-checks' },
      nachrichten,
      profil,
    ],
    routes: ['/noten', '/abwesenheit/neu'],
  },
  GUARDIAN: {
    home: '/heute',
    tabs: [
      heute,
      plan,
      { labelKey: 'abwesenheit', href: '/abwesenheit/neu', icon: 'user-round-x' },
      nachrichten,
      profil,
    ],
    routes: ['/kind/[id]/plan', '/kind/[id]/fehlzeiten', '/termine'],
  },
  TEACHER: {
    home: '/heute',
    tabs: [
      heute,
      { labelKey: 'klassenbuch', href: '/klassenbuch', icon: 'book-open-check' },
      { labelKey: 'klassen', href: '/klassen', icon: 'users' },
      nachrichten,
      profil,
    ],
    routes: [
      '/klassenbuch/[occurrenceId]',
      '/klassen/[id]',
      '/pruefungen',
      '/krankmeldung',
      '/noten',
      '/raeume',
      '/plan',
    ],
  },
  HOMEROOM: {
    home: '/heute',
    tabs: [
      heute,
      { labelKey: 'klassenbuch', href: '/klassenbuch', icon: 'book-open-check' },
      { labelKey: 'meineKlasse', href: '/klasse', icon: 'graduation-cap' },
      nachrichten,
      profil,
    ],
    routes: [
      '/klassenbuch/[occurrenceId]',
      '/plan',
      '/pruefungen',
      '/krankmeldung',
      '/klasse/[id]/uebersicht',
      '/klasse/[id]/entschuldigungen',
      '/klasse/[id]/fehlzeiten',
      '/klassen',
      '/klassen/[id]',
      '/raeume',
      '/auswertung',
    ],
  },
  PRINCIPAL: {
    home: '/lagebild',
    tabs: [
      { labelKey: 'lagebild', href: '/lagebild', icon: 'layout-dashboard' },
      { labelKey: 'supplierung', href: '/supplierung', icon: 'arrow-left-right' },
      { labelKey: 'auswertung', href: '/auswertung', icon: 'chart-column' },
      nachrichten,
      mehr,
    ],
    routes: [
      '/freigaben',
      '/rundschreiben',
      '/rundschreiben/neu',
      '/rundschreiben/[id]',
      '/profil',
      '/klassen',
      '/klassen/[id]',
      '/raeume',
      '/admin/einstellungen',
      '/klassenbuch/[occurrenceId]', // Korrektur durch die Direktion
      '/klasse',
      '/klasse/[id]/entschuldigungen',
      '/klasse/[id]/fehlzeiten',
      '/pruefungen',
      '/plan',
      '/admin/protokoll',
      // Stammdaten: Direktion darf lesen
      '/admin/personen',
      '/admin/personen/[id]',
      '/admin/klassen',
      '/admin/klassen/[id]',
      '/admin/schuljahr',
      '/admin/raster',
      '/admin/faecher',
      '/admin/raeume',
      '/admin/stundenplan',
      '/admin/stundenplan/[id]',
    ],
  },
  ADMIN: {
    home: '/admin/personen',
    tabs: [
      { labelKey: 'personen', href: '/admin/personen', icon: 'users' },
      { labelKey: 'klassen', href: '/admin/klassen', icon: 'graduation-cap' },
      { labelKey: 'stundenplan', href: '/admin/stundenplan', icon: 'calendar-days' },
      { labelKey: 'import', href: '/admin/import', icon: 'upload' },
      mehr,
    ],
    routes: [
      '/admin/personen/[id]',
      '/admin/klassen/[id]',
      '/admin/faecher',
      '/admin/raeume',
      '/admin/stundenplan/[id]',
      '/plan',
      '/admin/raster',
      '/admin/rollen',
      '/admin/schuljahr',
      '/admin/protokoll',
      '/admin/datenschutz',
      '/admin/einstellungen',
      '/nachrichten',
      '/rundschreiben',
      '/rundschreiben/neu',
      '/rundschreiben/[id]',
      '/lagebild',
      '/auswertung',
      '/supplierung',
      '/profil',
      '/abwesenheit/neu',
      '/klasse',
      '/klasse/[id]/entschuldigungen',
      '/klasse/[id]/fehlzeiten',
    ],
  },
};

/** Einträge der Seite "Mehr" (Direktion und Administration): alles, was nicht in der Tab-Leiste steht. */
const MORE: Partial<Record<Role, NavItem[]>> = {
  PRINCIPAL: [
    { labelKey: 'stundenplaene', href: '/admin/stundenplan', icon: 'calendar-days' },
    { labelKey: 'plan', href: '/plan', icon: 'calendar-range' },
    { labelKey: 'freigaben', href: '/freigaben', icon: 'circle-check' },
    { labelKey: 'rundschreiben', href: '/rundschreiben', icon: 'megaphone' },
    { labelKey: 'entschuldigungen', href: '/klasse', icon: 'file-check' },
    { labelKey: 'pruefungen', href: '/pruefungen', icon: 'notebook-pen' },
    { labelKey: 'personen', href: '/admin/personen', icon: 'users' },
    { labelKey: 'klassen', href: '/admin/klassen', icon: 'graduation-cap' },
    { labelKey: 'schuljahr', href: '/admin/schuljahr', icon: 'calendar-range' },
    { labelKey: 'raster', href: '/admin/raster', icon: 'clock' },
    { labelKey: 'faecher', href: '/admin/faecher', icon: 'book-open' },
    { labelKey: 'raeume', href: '/admin/raeume', icon: 'door-open' },
    { labelKey: 'protokoll', href: '/admin/protokoll', icon: 'scroll-text' },
    { labelKey: 'einstellungen', href: '/admin/einstellungen', icon: 'settings' },
  ],
  ADMIN: [
    { labelKey: 'lagebild', href: '/lagebild', icon: 'layout-dashboard' },
    { labelKey: 'auswertung', href: '/auswertung', icon: 'chart-column' },
    { labelKey: 'plan', href: '/plan', icon: 'calendar-range' },
    { labelKey: 'schuljahr', href: '/admin/schuljahr', icon: 'calendar-range' },
    { labelKey: 'raster', href: '/admin/raster', icon: 'clock' },
    { labelKey: 'faecher', href: '/admin/faecher', icon: 'book-open' },
    { labelKey: 'raeume', href: '/admin/raeume', icon: 'door-open' },
    { labelKey: 'rollen', href: '/admin/rollen', icon: 'shield-check' },
    { labelKey: 'protokoll', href: '/admin/protokoll', icon: 'scroll-text' },
    { labelKey: 'datenschutz', href: '/admin/datenschutz', icon: 'lock' },
    { labelKey: 'einstellungen', href: '/admin/einstellungen', icon: 'settings' },
    { labelKey: 'nachrichten', href: '/nachrichten', icon: 'message-square' },
    { labelKey: 'rundschreiben', href: '/rundschreiben', icon: 'megaphone' },
    { labelKey: 'supplierung', href: '/supplierung', icon: 'arrow-left-right' },
    { labelKey: 'entschuldigungen', href: '/klasse', icon: 'file-check' },
    { labelKey: 'abwesenheitMelden', href: '/abwesenheit/neu', icon: 'user-round-x' },
  ],
};

export function moreFor(roles: readonly Role[]): NavItem[] {
  const primary = ROLE_PRIORITY.find((r) => roles.includes(r));
  return (primary && MORE[primary]) || [];
}

/** Vorrang bei der Wahl der Tab-Leiste, wenn jemand mehrere Rollen hat. */
const ROLE_PRIORITY: Role[] = ['ADMIN', 'PRINCIPAL', 'HOMEROOM', 'TEACHER', 'GUARDIAN', 'STUDENT'];

export interface Navigation {
  home: string;
  tabs: NavItem[];
  /** Alle Routenmuster, die diese Person öffnen darf. */
  allowedRoutes: string[];
}

export function navigationFor(roles: readonly Role[]): Navigation {
  const ordered = ROLE_PRIORITY.filter((r) => roles.includes(r));
  const primary = ordered[0];
  if (!primary) return { home: '/profil', tabs: [profil], allowedRoutes: ['/profil'] };
  const allowed = new Set<string>([
    '/profil',
    '/nachrichten',
    '/nachrichten/neu',
    '/nachrichten/[id]',
    '/nachrichten/rundschreiben/[id]',
    '/mehr',
    '/benachrichtigungen',
  ]);
  for (const role of ordered) {
    for (const t of NAV[role].tabs) allowed.add(t.href);
    for (const r of NAV[role].routes) allowed.add(r);
  }
  return { home: NAV[primary].home, tabs: NAV[primary].tabs, allowedRoutes: [...allowed] };
}

function patternToRegExp(pattern: string): RegExp {
  const source = pattern
    .split('/')
    .map((seg) => (/^\[.+\]$/.test(seg) ? '[^/]+' : seg.replace(/[.*+?^${}()|\\]/g, '\\$&')))
    .join('/');
  return new RegExp(`^${source}/?$`);
}

export function isRouteAllowed(nav: Navigation, pathname: string): boolean {
  return nav.allowedRoutes.some((p) => patternToRegExp(p).test(pathname));
}
