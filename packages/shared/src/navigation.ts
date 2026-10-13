/** Navigation je Rolle (Design System "Web und Mobile" Abschnitt 3, Spec Abschnitt 5): Tab-Leiste mobil, Seitenleiste ab 1024 px. */
import type { Role } from './constants';

export interface NavItem {
  /** Schlüssel in messages/*.json unter "nav". */
  labelKey: string;
  href: string;
  /** Name eines Lucide-Icons (kebab-case). */
  icon: string;
  /** Hauptaktion der Rolle: mittlerer Tab, als Amber-Taste angehoben (Design System, Navigation). */
  primary?: boolean;
  /** Zähler (Amber) nur für Dinge mit Frist; Quelle sind vorhandene Abfragen. */
  count?: NavCount;
}

export type NavCount = 'openEntries' | 'openSubstitutions';

/** Abschnitt der Seitenleiste, optional mit Überschrift (z. B. "Schule"). */
export interface NavSection {
  labelKey?: string;
  items: NavItem[];
}

interface RoleNav {
  home: string;
  /** Mobile Tab-Leiste: genau fünf, Mitte = Hauptaktion, rechts "Mehr". */
  tabs: NavItem[];
  /** Seitenleiste ab 1024 px; was nicht in den Tabs steht, zeigt mobil das Mehr-Sheet. */
  sections: NavSection[];
  /** Weitere erlaubte Routen (Muster mit [param]), die nicht in der Navigation erscheinen. */
  routes: string[];
}

const item = (
  labelKey: string,
  href: string,
  icon: string,
  extra: Partial<NavItem> = {},
): NavItem => ({
  labelKey,
  href,
  icon,
  ...extra,
});

const heute = item('heute', '/heute', 'house');
const plan = item('plan', '/plan', 'calendar-days');
const stundenplan = item('stundenplan', '/plan', 'calendar-days');
const nachrichten = item('nachrichten', '/nachrichten', 'message-square');
const chat = item('chat', '/nachrichten', 'message-square');
const mehr = item('mehr', '/mehr', 'ellipsis');
const klassenbuch = item('klassenbuch', '/klassenbuch', 'book-open-check', {
  count: 'openEntries',
});
const pruefungen = item('pruefungen', '/pruefungen', 'notebook-pen');
const klassen = item('klassen', '/klassen', 'users');
const raeume = item('raeume', '/raeume', 'door-open');
const krankmeldung = item('krankmeldung', '/krankmeldung', 'thermometer');
const lagebild = item('lagebild', '/lagebild', 'layout-dashboard');
const supplierung = item('supplierung', '/supplierung', 'arrow-left-right', {
  count: 'openSubstitutions',
});
const auswertung = item('auswertung', '/auswertung', 'chart-column');
const freigaben = item('freigaben', '/freigaben', 'circle-check');
const rundschreiben = item('rundschreiben', '/rundschreiben', 'megaphone');
const entschuldigungen = item('entschuldigungen', '/klasse', 'file-check');
const adminStundenplan = item('stundenplan', '/admin/stundenplan', 'calendar-range');
const personen = item('personen', '/admin/personen', 'users');
const adminKlassen = item('klassen', '/admin/klassen', 'graduation-cap');
const faecher = item('faecher', '/admin/faecher', 'book-open');
const adminRaeume = item('raeume', '/admin/raeume', 'door-open');
const schuljahr = item('schuljahr', '/admin/schuljahr', 'calendar-range');
const raster = item('raster', '/admin/raster', 'clock');
const protokoll = item('protokoll', '/admin/protokoll', 'scroll-text');
const einstellungen = item('einstellungen', '/admin/einstellungen', 'settings');

const primary = (i: NavItem, labelKey = i.labelKey): NavItem => ({ ...i, labelKey, primary: true });

const TEACHER_ROUTES = [
  '/klassenbuch/[occurrenceId]',
  '/klassen/[id]',
  '/pruefungen',
  '/krankmeldung',
  '/noten',
  '/raeume',
  '/plan',
];

/** Navigation je Rolle nach dem Design System ("Web und Mobile", Abschnitt 3; Entscheidung F2 im Design-Audit). */
const NAV: Record<Role, RoleNav> = {
  STUDENT: {
    home: '/heute',
    // Abweichung vom Design System (Entscheidung F5 im Design-Audit): Heute ist Hauptaktion und Startseite
    tabs: [plan, item('hausuebungen', '/aufgaben', 'list-checks'), primary(heute), chat, mehr],
    sections: [
      {
        items: [heute, stundenplan, item('hausuebungen', '/aufgaben', 'list-checks'), nachrichten],
      },
    ],
    routes: ['/noten', '/abwesenheit/neu'],
  },
  GUARDIAN: {
    home: '/heute',
    tabs: [
      heute,
      plan,
      primary(item('abwesenheit', '/abwesenheit/neu', 'user-round-x')),
      nachrichten,
      mehr,
    ],
    sections: [
      {
        items: [
          heute,
          stundenplan,
          item('abwesenheit', '/abwesenheit/neu', 'user-round-x'),
          item('termine', '/termine', 'calendar-range'),
          nachrichten,
        ],
      },
    ],
    routes: ['/kind/[id]/plan', '/kind/[id]/fehlzeiten', '/termine'],
  },
  TEACHER: {
    home: '/heute',
    tabs: [heute, plan, primary(klassenbuch), chat, mehr],
    sections: [
      { items: [heute, stundenplan, klassenbuch, pruefungen, nachrichten] },
      { labelKey: 'schule', items: [klassen, raeume, krankmeldung] },
    ],
    routes: TEACHER_ROUTES,
  },
  HOMEROOM: {
    home: '/heute',
    tabs: [heute, plan, primary(klassenbuch), chat, mehr],
    sections: [
      {
        items: [
          heute,
          stundenplan,
          klassenbuch,
          item('meineKlasse', '/klasse', 'graduation-cap'),
          pruefungen,
          nachrichten,
        ],
      },
      { labelKey: 'schule', items: [klassen, raeume, auswertung, krankmeldung] },
    ],
    routes: [
      ...TEACHER_ROUTES,
      '/klasse/[id]/uebersicht',
      '/klasse/[id]/entschuldigungen',
      '/klasse/[id]/fehlzeiten',
      '/klassen',
      '/auswertung',
    ],
  },
  PRINCIPAL: {
    home: '/lagebild',
    tabs: [lagebild, supplierung, primary(freigaben), nachrichten, mehr],
    sections: [
      {
        items: [
          lagebild,
          supplierung,
          item('pruefungskalender', '/pruefungen', 'notebook-pen'),
          auswertung,
          freigaben,
          nachrichten,
          rundschreiben,
        ],
      },
      {
        labelKey: 'schule',
        items: [
          entschuldigungen,
          item('plan', '/plan', 'calendar-days'),
          item('stundenplaene', '/admin/stundenplan', 'calendar-range'),
          personen,
          adminKlassen,
          schuljahr,
          raster,
          faecher,
          adminRaeume,
          protokoll,
          einstellungen,
        ],
      },
    ],
    routes: [
      '/rundschreiben/neu',
      '/rundschreiben/[id]',
      '/profil',
      '/klassen',
      '/klassen/[id]',
      '/raeume',
      '/klassenbuch/[occurrenceId]', // Korrektur durch die Direktion
      '/klasse/[id]/entschuldigungen',
      '/klasse/[id]/fehlzeiten',
      // Stammdaten: Direktion darf lesen
      '/admin/personen/[id]',
      '/admin/klassen/[id]',
      '/admin/stundenplan/[id]',
    ],
  },
  ADMIN: {
    home: '/admin',
    tabs: [
      item('uebersicht', '/admin', 'layout-dashboard'),
      adminStundenplan,
      primary(item('import', '/admin/import', 'upload')),
      nachrichten,
      mehr,
    ],
    sections: [
      {
        items: [
          item('uebersicht', '/admin', 'layout-dashboard'),
          adminStundenplan,
          item('import', '/admin/import', 'upload'),
          item('rechte', '/admin/rollen', 'shield-check'),
          nachrichten,
        ],
      },
      {
        labelKey: 'stammdaten',
        items: [personen, adminKlassen, faecher, adminRaeume, schuljahr, raster],
      },
      {
        labelKey: 'schule',
        items: [
          lagebild,
          auswertung,
          supplierung,
          rundschreiben,
          entschuldigungen,
          item('abwesenheitMelden', '/abwesenheit/neu', 'user-round-x'),
          item('plan', '/plan', 'calendar-days'),
          item('datenschutz', '/admin/datenschutz', 'lock'),
          protokoll,
          einstellungen,
        ],
      },
    ],
    routes: [
      '/admin/personen/[id]',
      '/admin/klassen/[id]',
      '/admin/stundenplan/[id]',
      '/rundschreiben/neu',
      '/rundschreiben/[id]',
      '/profil',
      '/klasse/[id]/entschuldigungen',
      '/klasse/[id]/fehlzeiten',
    ],
  },
};

/** Vorrang bei der Wahl der Navigation, wenn jemand mehrere Rollen hat. */
const ROLE_PRIORITY: Role[] = ['ADMIN', 'PRINCIPAL', 'HOMEROOM', 'TEACHER', 'GUARDIAN', 'STUDENT'];

/**
 * Ansichten, zwischen denen eine Person wechseln kann ("Rolle wechseln" im Mehr-Sheet). Klassenvorstand enthält
 * die Lehreransicht, deshalb zählt Lehrer daneben nicht als eigene Ansicht.
 */
export function navViews(roles: readonly Role[]): Role[] {
  const ordered = ROLE_PRIORITY.filter((r) => roles.includes(r));
  return ordered.filter((r) => !(r === 'TEACHER' && ordered.includes('HOMEROOM')));
}

/**
 * Anrede (Design System, Inhaltliche Grundsätze): Sie für Eltern, Direktion und Administration, du für
 * Schüler:innen und Lehrkräfte. Maßgeblich ist die wichtigste Rolle; ohne Rolle gilt Sie (z. B. E-Mails).
 */
export function formalAddress(roles: readonly Role[]): boolean {
  const view = navViews(roles)[0];
  return view === undefined || view === 'GUARDIAN' || view === 'PRINCIPAL' || view === 'ADMIN';
}

export interface Navigation {
  /** Rolle, deren Navigation gezeigt wird. */
  view: Role | null;
  home: string;
  tabs: NavItem[];
  sections: NavSection[];
  /** Alle Routenmuster, die diese Person öffnen darf (alle Rollen zusammen). */
  allowedRoutes: string[];
}

/** Navigation für die Rollen einer Person; `preferred` ist die gewählte Ansicht (Cookie pf-role), wenn erlaubt. */
export function navigationFor(roles: readonly Role[], preferred?: string | null): Navigation {
  const views = navViews(roles);
  const view = views.find((r) => r === preferred) ?? views[0];
  if (!view) {
    const profil = item('profil', '/profil', 'user-round');
    return {
      view: null,
      home: '/profil',
      tabs: [profil],
      sections: [],
      allowedRoutes: ['/profil'],
    };
  }
  const allowed = new Set<string>([
    '/profil',
    '/nachrichten',
    '/nachrichten/neu',
    '/nachrichten/[id]',
    '/nachrichten/rundschreiben/[id]',
    '/mehr',
    '/benachrichtigungen',
  ]);
  for (const role of ROLE_PRIORITY.filter((r) => roles.includes(r))) {
    const n = NAV[role];
    allowed.add(n.home);
    for (const t of n.tabs) allowed.add(t.href);
    for (const sec of n.sections) for (const i of sec.items) allowed.add(i.href);
    for (const r of n.routes) allowed.add(r);
  }
  const n = NAV[view];
  return { view, home: n.home, tabs: n.tabs, sections: n.sections, allowedRoutes: [...allowed] };
}

/** Einträge für "Mehr" (mobil): alles aus der Seitenleiste, was nicht in der Tab-Leiste steht. */
export function moreSections(nav: Navigation): NavSection[] {
  const inTabs = new Set(nav.tabs.map((t) => t.href));
  return nav.sections
    .map((s) => ({ ...s, items: s.items.filter((i) => !inTabs.has(i.href)) }))
    .filter((s) => s.items.length > 0);
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
