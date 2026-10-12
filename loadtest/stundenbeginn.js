// Lasttest (Spec Abschnitt 13): Stundenbeginn – viele Lehrkräfte speichern Anwesenheit, viele Schüler:innen
// und Eltern öffnen "Heute". Ziele: Lesen p95 < 200 ms, Klassenbuch speichern p95 < 300 ms.
//
//   k6 run -e BASE_URL=http://demo.localhost:3000 -e SESSIONS=loadtest/sessions.json loadtest/stundenbeginn.js
//   (ohne lokales k6: docker run --rm -i --network host -v "$PWD":/w -w /w grafana/k6 run …)
//
// sessions.json erzeugt `node loadtest/sessions.mjs` (meldet Testkonten an, siehe dort). Nur gegen Test- oder
// Staging-Umgebungen mit Demo-Daten laufen lassen: die Anwesenheit wird mit dem aktuellen Stand neu gespeichert.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'http://demo.localhost:3000';
const sessions = JSON.parse(open(__ENV.SESSIONS || 'sessions.json'));
const readTrend = new Trend('sp_read_ms', true);
const saveTrend = new Trend('sp_save_ms', true);

export const options = {
  scenarios: {
    heute: {
      executor: 'ramping-vus',
      exec: 'heute',
      startVUs: 0,
      stages: [
        { duration: '20s', target: Number(__ENV.READERS || 60) },
        { duration: '60s', target: Number(__ENV.READERS || 60) },
        { duration: '10s', target: 0 },
      ],
    },
    klassenbuch: {
      executor: 'ramping-vus',
      exec: 'klassenbuch',
      startVUs: 0,
      stages: [
        { duration: '20s', target: Number(__ENV.TEACHERS || 20) },
        { duration: '60s', target: Number(__ENV.TEACHERS || 20) },
        { duration: '10s', target: 0 },
      ],
    },
  },
  thresholds: {
    sp_read_ms: ['p(95)<200'],
    sp_save_ms: ['p(95)<300'],
    http_req_failed: ['rate<0.01'],
  },
};

const headers = (s, write) => ({
  cookie: `sp_session=${s.cookie}`,
  ...(write ? { 'content-type': 'application/json', 'x-csrf-token': s.csrf } : {}),
});
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export function heute() {
  const s = pick(sessions.readers);
  const res = http.get(`${BASE}/api/v1/today`, {
    headers: headers(s, false),
    tags: { name: 'today' },
  });
  readTrend.add(res.timings.duration);
  check(res, { 'today 200': (r) => r.status === 200 });
  sleep(1 + Math.random() * 2);
}

export function klassenbuch() {
  const s = pick(sessions.teachers);
  const occ = pick(s.occurrences);
  const detail = http.get(`${BASE}/api/v1/occurrences/${occ}`, {
    headers: headers(s, false),
    tags: { name: 'occurrence' },
  });
  readTrend.add(detail.timings.duration);
  if (!check(detail, { 'occurrence 200': (r) => r.status === 200 })) return sleep(1);
  const d = detail.json();
  const now = new Date().toISOString();
  // Aktuellen Stand erneut speichern (idempotent für die Daten, volle Last für den Server)
  const items = d.students.map((st) => {
    const cur = d.attendance[st.id];
    return {
      studentId: st.id,
      status: cur ? cur.status : 'PRESENT',
      lateMinutes: cur && cur.status === 'LATE' ? cur.lateMinutes : null,
      clientMutationId: `k6-${__VU}-${__ITER}-${st.id}`,
      clientUpdatedAt: now,
    };
  });
  const res = http.put(`${BASE}/api/v1/occurrences/${occ}/attendance`, JSON.stringify({ items }), {
    headers: headers(s, true),
    tags: { name: 'attendance' },
  });
  saveTrend.add(res.timings.duration);
  check(res, { 'attendance 200': (r) => r.status === 200 });
  sleep(2 + Math.random() * 3);
}
