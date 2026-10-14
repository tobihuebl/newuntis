import { describe, expect, it } from 'vitest';
import { levelOf, nextClassName, promotionsInput } from './promotions';

describe('Schuljahreswechsel (SD-05)', () => {
  it('liest die Stufe aus dem Klassennamen', () => {
    expect(levelOf('3A')).toBe(3);
    expect(levelOf('10B')).toBe(10);
    expect(levelOf(' 5 HAK')).toBe(5);
    expect(levelOf('Sonnenklasse')).toBeNull();
  });
  it('schlägt die Folgeklasse vor (Stufe plus eins, Rest bleibt)', () => {
    expect(nextClassName('2A')).toBe('3A');
    expect(nextClassName('9b')).toBe('10b');
    expect(nextClassName('4 HAK')).toBe('5 HAK');
    expect(nextClassName('Sonnenklasse')).toBeNull();
  });
  it('Entscheidungen: nur die vier Arten, Anmerkung optional', () => {
    const ok = promotionsInput.safeParse({
      classId: 'c',
      items: [{ studentId: 's', decision: 'EXAM', note: '' }],
    });
    expect(ok.success && ok.data.items[0]!.note).toBeNull();
    expect(
      promotionsInput.safeParse({ classId: 'c', items: [{ studentId: 's', decision: 'FAIL' }] })
        .success,
    ).toBe(false);
  });
});
