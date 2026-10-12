import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Harness } from './support/harness';

const TOKEN = 'metrics-token-for-tests-123456';

describe('Überwachung: GET /metrics', () => {
  let h: Harness;
  beforeAll(async () => {
    process.env.METRICS_TOKEN = TOKEN;
    h = await Harness.create();
  });
  afterAll(async () => {
    delete process.env.METRICS_TOKEN;
    await h.close();
  });

  it('nur mit Token, sonst 404', async () => {
    expect((await h.app.inject({ method: 'GET', url: '/metrics' })).statusCode).toBe(404);
    const wrong = await h.app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { authorization: 'Bearer falsch' },
    });
    expect(wrong.statusCode).toBe(404);
  });

  it('zählt Anfragen je Statusklasse ohne Pfade oder Ids', async () => {
    const t = await h.createTenant();
    await h.client(t.slug).get('/me'); // 401
    const res = await h.app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.body).toMatch(/sp_http_requests_total\{method="GET",status="4xx"\} \d+/);
    expect(res.body).toContain('sp_uptime_seconds');
    expect(res.body).not.toContain(t.slug);
  });
});
