import { describe, expect, it } from 'vitest';
import { parseServerEnv, tenantSettingsSchema, TWO_FACTOR_REQUIRED_ROLES } from './index';

describe('tenantSettingsSchema', () => {
  it('liefert Standardwerte für leere Einstellungen', () => {
    const s = tenantSettingsSchema.parse({});
    expect(s.absence.excuseDeadlineDays).toBe(7);
    expect(s.ageLimits.selfExcuseFrom).toBe(14);
  });
  it('lehnt ungültige Fristen ab', () => {
    expect(() => tenantSettingsSchema.parse({ absence: { excuseDeadlineDays: -1 } })).toThrow();
  });
});

describe('parseServerEnv', () => {
  it('verlangt ein ausreichend langes SESSION_SECRET', () => {
    expect(() => parseServerEnv({ SESSION_SECRET: 'kurz' })).toThrow();
  });
});

describe('Rollen', () => {
  it('verlangt 2FA für Lehrer, Direktion und Administration, nicht für Schüler und Eltern', () => {
    expect(TWO_FACTOR_REQUIRED_ROLES).toContain('TEACHER');
    expect(TWO_FACTOR_REQUIRED_ROLES).not.toContain('STUDENT');
    expect(TWO_FACTOR_REQUIRED_ROLES).not.toContain('GUARDIAN');
  });
});
