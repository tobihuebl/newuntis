import { describe, expect, it } from 'vitest';
import { activeHref, normalize } from './nav-model';

describe('activeHref', () => {
  it('wählt den längsten passenden Eintrag', () => {
    const hrefs = ['/admin', '/admin/personen', '/heute'];
    expect(activeHref('/admin', hrefs)).toBe('/admin');
    expect(activeHref('/admin/personen/abc', hrefs)).toBe('/admin/personen');
    expect(activeHref('/administration', hrefs)).toBeNull();
  });
});

describe('normalize', () => {
  it('findet Umlaute auch in Umschreibung', () => {
    expect(normalize('Prüfungen')).toContain(normalize('pruef'));
    expect(normalize('Fächer')).toBe('faecher');
  });
});
