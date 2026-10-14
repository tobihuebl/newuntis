import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WEIGHTS,
  gradeDistribution,
  gradeWeightsSchema,
  kindFromExam,
  weightedAverage,
} from './grades';

describe('Noten (PN-02)', () => {
  it('mittelt je Notenart und gewichtet dann in Prozent', () => {
    // Schularbeiten 2 und 3 (Mittel 2,5), Test 1, Mitarbeit 2; 50/25/10/15, Mündlich fehlt → 90 % zählen
    const avg = weightedAverage(
      [
        { kind: 'SCHULARBEIT', value: 2 },
        { kind: 'SCHULARBEIT', value: 3 },
        { kind: 'TEST', value: 1 },
        { kind: 'MITARBEIT', value: 2 },
      ],
      DEFAULT_WEIGHTS,
    );
    expect(avg).toBe(Math.round(((50 * 2.5 + 25 * 1 + 15 * 2) / 90) * 100) / 100);
  });

  it('Notenarten mit 0 % zählen nicht; ohne gewichtete Noten gibt es keinen Durchschnitt', () => {
    const w = { SCHULARBEIT: 100, TEST: 0, MUENDLICH: 0, MITARBEIT: 0 };
    expect(weightedAverage([{ kind: 'TEST', value: 1 }], w)).toBeNull();
    expect(
      weightedAverage(
        [
          { kind: 'SCHULARBEIT', value: 4 },
          { kind: 'TEST', value: 1 },
        ],
        w,
      ),
    ).toBe(4);
    expect(weightedAverage([], DEFAULT_WEIGHTS)).toBeNull();
  });

  it('Notenspiegel zählt je Note und rechnet den Durchschnitt', () => {
    expect(gradeDistribution([1, 2, 2, 5])).toEqual({
      counts: { 1: 1, 2: 2, 3: 0, 4: 0, 5: 1 },
      average: 2.5,
    });
    expect(gradeDistribution([]).average).toBeNull();
  });

  it('Gewichte müssen 100 % ergeben; Prüfungsarten werden zugeordnet', () => {
    expect(gradeWeightsSchema.safeParse(DEFAULT_WEIGHTS).success).toBe(true);
    expect(gradeWeightsSchema.safeParse({ ...DEFAULT_WEIGHTS, TEST: 30 }).success).toBe(false);
    expect(kindFromExam('Schularbeit')).toBe('SCHULARBEIT');
    expect(kindFromExam('Mündliche Prüfung')).toBe('MUENDLICH');
    expect(kindFromExam('Test')).toBe('TEST');
  });
});
