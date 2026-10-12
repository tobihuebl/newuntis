import { describe, expect, it } from 'vitest';
import messages from '../messages/de-AT.json';

/** next-intl verbietet Punkte in Schlüsseln (Punkt = Verschachtelung); sonst bricht die ganze App. */
describe('Übersetzungen', () => {
  it('keine Punkte in Schlüsseln', () => {
    const bad: string[] = [];
    const walk = (o: unknown, path: string) => {
      if (o && typeof o === 'object')
        for (const [k, v] of Object.entries(o)) {
          if (k.includes('.')) bad.push(`${path}${k}`);
          walk(v, `${path}${k}/`);
        }
    };
    walk(messages, '');
    expect(bad).toEqual([]);
  });
});
