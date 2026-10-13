import { describe, expect, it } from 'vitest';
import type { TranslateDirectory } from '@sp/shared';
import { GATEWAY_URL, pseudonymize, translateWithAi } from './ai-translate';

const dir: TranslateDirectory = {
  teachers: [
    { id: 'hu', firstName: 'Anna', lastName: 'Huber' },
    { id: 'oz', firstName: 'Ece', lastName: 'Özdemir' },
  ],
  subjects: [{ id: 'bsp', name: 'Bewegung und Sport', code: 'BSP' }],
  classes: [{ id: '3a', name: '3A' }],
  rooms: [{ id: 'ts', name: 'Turnsaal' }],
  maxPeriod: 7,
};

function gateway(content: object, region = 'eu') {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fetchImpl = (async (url: string, init: { body: string }) => {
    calls.push({ url, body: JSON.parse(init.body) as Record<string, unknown> });
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify(content),
              provider_metadata: {
                gateway: {
                  routing: {
                    modelAttempts: [
                      { providerAttempts: [{ inferenceEndpoint: { geoRegion: region } }] },
                    ],
                  },
                },
              },
            },
          },
        ],
      }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe('KI-Übersetzer (Vercel AI Gateway)', () => {
  it('ersetzt Namen durch Kürzel, auch mit Anrede und Umlaut', () => {
    const p = pseudonymize('Frau Özdemir und Anna Huber; Lena Berger fehlt', dir.teachers, [
      'Lena',
      'Berger',
    ]);
    expect(p.text).toBe('L02 und L01; [Person] [Person] fehlt');
    expect([...p.codes].sort()).toEqual([
      ['L01', 'hu'],
      ['L02', 'oz'],
    ]);
  });

  it('schickt nur Kürzel, fest EU-Region und Zero Data Retention; übersetzt Kürzel zurück', async () => {
    const sentence = 'Frau Huber unterrichtet am Freitag nie';
    const { fetchImpl, calls } = gateway({
      items: [
        {
          sentence: 'L01 unterrichtet am Freitag nie',
          kind: 'TEACHER_UNAVAILABLE',
          teacher: 'L01',
          weekday: 5,
        },
      ],
    });
    const r = await translateWithAi({
      apiKey: 'test-key-123',
      model: 'anthropic/x',
      sentences: [sentence],
      dir,
      otherNames: [],
      fetchImpl,
    });
    expect(calls[0]!.url).toBe(GATEWAY_URL);
    const sent = JSON.stringify(calls[0]!.body);
    expect(sent).not.toContain('Huber');
    expect(sent).not.toContain('Özdemir');
    expect(calls[0]!.body.providerOptions).toEqual({
      gateway: { inferenceRegion: { scope: 'zone', geoRegion: 'eu' }, zeroDataRetention: true },
    });
    expect(r.unresolved).toEqual([]);
    expect(r.proposals[0]!.constraint).toMatchObject({
      kind: 'TEACHER_UNAVAILABLE',
      teacherId: 'hu',
      weekday: 5,
      source: 'AI',
      text: sentence,
    });
  });

  it('verwirft Antworten mit unbekannten Kürzeln, falschem Schema oder außerhalb der EU', async () => {
    const sentence = 'Turnen immer im Gymnastikraum';
    const unknownRoom = gateway({
      items: [{ sentence, kind: 'SUBJECT_ROOMS', subject: 'BSP', rooms: ['Gymnastikraum'] }],
    });
    expect(
      (
        await translateWithAi({
          apiKey: 'test-key-123',
          model: 'm',
          sentences: [sentence],
          dir,
          otherNames: [],
          fetchImpl: unknownRoom.fetchImpl,
        })
      ).unresolved,
    ).toEqual([sentence]);
    const us = gateway(
      { items: [{ sentence, kind: 'SUBJECT_ROOMS', subject: 'BSP', rooms: ['Turnsaal'] }] },
      'us',
    );
    expect(
      (
        await translateWithAi({
          apiKey: 'test-key-123',
          model: 'm',
          sentences: [sentence],
          dir,
          otherNames: [],
          fetchImpl: us.fetchImpl,
        })
      ).proposals,
    ).toEqual([]);
    const garbage = gateway({ items: [{ sentence, kind: 'NONSENSE' }] });
    expect(
      (
        await translateWithAi({
          apiKey: 'test-key-123',
          model: 'm',
          sentences: [sentence],
          dir,
          otherNames: [],
          fetchImpl: garbage.fetchImpl,
        })
      ).proposals,
    ).toEqual([]);
  });

  it('Netzfehler: alles bleibt offen, nichts bricht', async () => {
    const failing = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const r = await translateWithAi({
      apiKey: 'test-key-123',
      model: 'm',
      sentences: ['x y z'],
      dir,
      otherNames: [],
      fetchImpl: failing,
    });
    expect(r).toEqual({ proposals: [], unresolved: ['x y z'] });
  });
});
