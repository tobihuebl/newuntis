import { describe, expect, it } from 'vitest';
import { ROLES, type Role } from './constants';
import {
  ACTIONS,
  PERMISSION_MATRIX,
  can,
  type PolicyResource,
  type PolicyUser,
  type Scope,
} from './permissions';
import { isRouteAllowed, moreSections, navViews, navigationFor } from './navigation';

const ME = 'person-me';

/** Pro Scope: Nutzerbeziehungen, ein passender und ein nicht passender Gegenstand. */
function fixture(scope: Scope): {
  rel: Partial<PolicyUser>;
  match: PolicyResource;
  miss: PolicyResource;
} {
  switch (scope) {
    case 'ALL':
      return { rel: {}, match: { classId: 'c1' }, miss: { classId: 'c1' } };
    case 'OWN':
      return { rel: {}, match: { studentId: ME }, miss: { studentId: 'other' } };
    case 'CHILDREN':
      return {
        rel: { guardianOfStudentIds: ['kid'] },
        match: { studentId: 'kid' },
        miss: { studentId: 'stranger' },
      };
    case 'OWN_CLASSES':
      return {
        rel: { teachesClassIds: ['c1'] },
        match: { classId: 'c1' },
        miss: { classId: 'c2' },
      };
    case 'OWN_CLASS':
      return {
        rel: { homeroomClassIds: ['c1'] },
        match: { classId: 'c1' },
        miss: { classId: 'c2' },
      };
    case 'OWN_SUBJECTS':
      return {
        rel: { teachingPairs: ['c1:m'] },
        match: { classId: 'c1', subjectId: 'm' },
        miss: { classId: 'c1', subjectId: 'e' },
      };
    case 'OWN_LESSONS':
      return { rel: {}, match: { teacherIds: [ME, 'x'] }, miss: { teacherIds: ['x'] } };
    case 'TO_TEACHERS':
      return {
        rel: {},
        match: { recipientsAreTeachers: true },
        miss: { recipientsAreTeachers: false },
      };
  }
}

const userWith = (role: Role, rel: Partial<PolicyUser> = {}): PolicyUser => ({
  personId: ME,
  roles: [role],
  ...rel,
});

describe('Rechte-Matrix (automatisch aus der Matrix erzeugt)', () => {
  for (const action of ACTIONS) {
    for (const role of ROLES) {
      const scope = PERMISSION_MATRIX[action][role];
      if (scope === undefined) {
        it(`${role} darf ${action} nicht`, () => {
          const f = fixture('ALL');
          expect(can(userWith(role), action)).toBe(false);
          expect(can(userWith(role), action, f.match)).toBe(false);
        });
        continue;
      }
      const f = fixture(scope);
      it(`${role} darf ${action} (${scope}) für passenden Gegenstand`, () => {
        expect(can(userWith(role, f.rel), action, f.match)).toBe(true);
        expect(can(userWith(role, f.rel), action)).toBe(true);
      });
      if (scope !== 'ALL') {
        it(`${role} darf ${action} (${scope}) nicht für fremden Gegenstand`, () => {
          expect(can(userWith(role, f.rel), action, f.miss)).toBe(false);
        });
        it(`${role} ohne Zuordnung darf ${action} (${scope}) nicht`, () => {
          expect(can(userWith(role), action, f.match)).toBe(
            scope === 'OWN' || scope === 'OWN_LESSONS' || scope === 'TO_TEACHERS',
          );
        });
      }
    }
  }
});

describe('Additive Rollen', () => {
  it('Lehrer und Elternteil: Rechte beider Rollen, jede mit eigenem Scope', () => {
    const u: PolicyUser = {
      personId: ME,
      roles: ['TEACHER', 'GUARDIAN'],
      guardianOfStudentIds: ['kid'],
      teachesClassIds: ['c1'],
    };
    expect(can(u, 'attendance.read', { studentId: 'kid' })).toBe(true); // als Elternteil
    expect(can(u, 'attendance.read', { classId: 'c1' })).toBe(true); // als Lehrer
    expect(can(u, 'attendance.read', { studentId: 'stranger' })).toBe(false);
    expect(can(u, 'announcement.send')).toBe(false);
  });
  it('ohne Rollen ist nichts erlaubt', () => {
    for (const a of ACTIONS) expect(can({ personId: ME, roles: [] }, a)).toBe(false);
  });
});

describe('Navigation', () => {
  it('jede Rolle hat höchstens 5 Tabs', () => {
    for (const r of ROLES) expect(navigationFor([r]).tabs.length).toBeLessThanOrEqual(5);
  });
  it('Tab-Leiste: fünf Tabs, genau eine Hauptaktion in der Mitte, rechts Mehr (Design System)', () => {
    for (const r of ROLES) {
      const { tabs } = navigationFor([r]);
      expect(tabs).toHaveLength(5);
      expect(tabs.filter((t) => t.primary).map((t) => tabs.indexOf(t))).toEqual([2]);
      expect(tabs[4]?.href).toBe('/mehr');
    }
  });
  it('Hauptaktion je Rolle wie im Design System', () => {
    const main = (r: Role) => navigationFor([r]).tabs[2]?.href;
    expect(main('STUDENT')).toBe('/aufgaben');
    expect(main('GUARDIAN')).toBe('/abwesenheit/neu');
    expect(main('TEACHER')).toBe('/klassenbuch');
    expect(main('HOMEROOM')).toBe('/klassenbuch');
    expect(main('PRINCIPAL')).toBe('/freigaben');
    expect(main('ADMIN')).toBe('/admin/import');
  });
  it('jede Seite der Navigation ist auch erlaubt, Mehr zeigt nur, was nicht in den Tabs steht', () => {
    for (const r of ROLES) {
      const nav = navigationFor([r]);
      for (const sec of nav.sections)
        for (const i of sec.items) expect(isRouteAllowed(nav, i.href)).toBe(true);
      const tabHrefs = new Set(nav.tabs.map((t) => t.href));
      for (const sec of moreSections(nav))
        for (const i of sec.items) expect(tabHrefs.has(i.href)).toBe(false);
    }
  });
  it('Rolle wechseln: gewählte Ansicht, nur aus den eigenen Rollen, Klassenvorstand ersetzt Lehrer', () => {
    expect(navViews(['TEACHER', 'HOMEROOM', 'GUARDIAN'])).toEqual(['HOMEROOM', 'GUARDIAN']);
    expect(navigationFor(['TEACHER', 'GUARDIAN'], 'GUARDIAN').view).toBe('GUARDIAN');
    expect(navigationFor(['TEACHER', 'GUARDIAN'], 'GUARDIAN').tabs[2]?.href).toBe(
      '/abwesenheit/neu',
    );
    expect(navigationFor(['TEACHER'], 'ADMIN').view).toBe('TEACHER');
  });
  it('Schüler sehen keine Admin- und Lehrerrouten', () => {
    const nav = navigationFor(['STUDENT']);
    expect(isRouteAllowed(nav, '/heute')).toBe(true);
    expect(isRouteAllowed(nav, '/admin/personen')).toBe(false);
    expect(isRouteAllowed(nav, '/klassenbuch/abc')).toBe(false);
  });
  it('Routenmuster mit Parametern passen genau ein Segment', () => {
    const nav = navigationFor(['TEACHER']);
    expect(isRouteAllowed(nav, '/klassenbuch/abc123')).toBe(true);
    expect(isRouteAllowed(nav, '/klassenbuch/abc/zusatz')).toBe(false);
  });
  it('Landeseite: Direktion und Administration landen auf ihrem Lagebild bzw. der Übersicht', () => {
    expect(navigationFor(['STUDENT']).home).toBe('/heute');
    expect(navigationFor(['PRINCIPAL']).home).toBe('/lagebild');
    expect(navigationFor(['ADMIN']).home).toBe('/admin');
  });
  it('mehrere Rollen: Tab-Leiste der wichtigsten, Routen aller Rollen', () => {
    const nav = navigationFor(['TEACHER', 'GUARDIAN']);
    expect(nav.tabs[2]?.href).toBe('/klassenbuch');
    expect(isRouteAllowed(nav, '/kind/k1/fehlzeiten')).toBe(true);
  });
});
