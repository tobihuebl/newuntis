// Meldet Testkonten an und schreibt loadtest/sessions.json für den k6-Lasttest.
// Nur für Test- und Staging-Umgebungen mit Demo-Daten (Seed): Konten und Passwort kommen aus der Umgebung.
//
//   LOAD_BASE_URL=http://demo.localhost:3000 LOAD_PASSWORD=… \
//   LOAD_READERS="schueler1@…,eltern1@…" LOAD_TEACHERS="lehrer1@…:TOTPSECRET,…" node loadtest/sessions.mjs
//
// Lehrkräfte brauchen 2FA: Angabe als "email:TOTP-Geheimnis" (Base32). Ist 2FA noch nicht eingerichtet (frische
// Testdaten), richtet das Skript sie ein und gibt die Geheimnisse aus.
import { writeFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';

const BASE = process.env.LOAD_BASE_URL ?? 'http://demo.localhost:3000';
const PASSWORD = process.env.LOAD_PASSWORD;
if (!PASSWORD) throw new Error('LOAD_PASSWORD fehlt');
const list = (v) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

function base32(s) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of s.replace(/=+$/, '').toUpperCase())
    bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  return Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
}
function totp(secret) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const h = createHmac('sha1', base32(secret)).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

async function login(email, secret) {
  let cookie = '';
  const call = async (method, path, body) => {
    const res = await fetch(`${BASE}/api/v1${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(cookie ? { cookie: `sp_session=${cookie}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie')?.match(/sp_session=([^;]*)/);
    if (set) cookie = set[1];
    return { status: res.status, json: await res.json().catch(() => ({})) };
  };
  const r = await call('POST', '/auth/login', { email, password: PASSWORD });
  if (r.status !== 200) throw new Error(`Anmeldung fehlgeschlagen (${r.status})`);
  let csrf = r.json.csrfToken;
  if (r.json.stage === 'NEEDS_2FA_SETUP') {
    const post = (path, body) =>
      fetch(`${BASE}/api/v1${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `sp_session=${cookie}`,
          'x-csrf-token': csrf,
        },
        body: JSON.stringify(body ?? {}),
      });
    const setup = await (await post('/auth/2fa/setup')).json();
    const enable = await post('/auth/2fa/enable', { code: totp(setup.secret) });
    if (!enable.ok) throw new Error(`2FA-Einrichtung fehlgeschlagen (${enable.status})`);
    const set = enable.headers.get('set-cookie')?.match(/sp_session=([^;]*)/);
    if (set) cookie = set[1];
    console.log(`2FA eingerichtet für ${email}`);
  } else if (r.json.stage === 'NEEDS_2FA_VERIFY') {
    if (!secret) throw new Error('TOTP-Geheimnis fehlt');
    const v = await fetch(`${BASE}/api/v1/auth/2fa/verify`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `sp_session=${cookie}`,
        'x-csrf-token': csrf,
      },
      body: JSON.stringify({ code: totp(secret) }),
    });
    if (!v.ok) throw new Error(`2FA fehlgeschlagen (${v.status})`);
    const set = v.headers.get('set-cookie')?.match(/sp_session=([^;]*)/);
    if (set) cookie = set[1];
  }
  const me = await call('GET', '/me');
  csrf = me.json.csrfToken;
  return { cookie, csrf, call };
}

const readers = [];
for (const email of list(process.env.LOAD_READERS)) {
  const s = await login(email);
  readers.push({ cookie: s.cookie, csrf: s.csrf });
}
const teachers = [];
for (const entry of list(process.env.LOAD_TEACHERS)) {
  const [email, secret] = entry.split(':');
  const s = await login(email, secret);
  const open = await s.call('GET', '/classbook/open');
  const today = await s.call('GET', '/today');
  const occurrences = [
    ...(open.json.data ?? []).map((o) => o.id),
    ...(today.json.lessons ?? []).filter((l) => l.status !== 'CANCELLED').map((l) => l.id),
  ];
  if (occurrences.length) teachers.push({ cookie: s.cookie, csrf: s.csrf, occurrences });
}
writeFileSync(
  new URL('./sessions.json', import.meta.url),
  JSON.stringify({ readers, teachers }, null, 2),
);
console.log(`sessions.json: ${readers.length} Lesende, ${teachers.length} Lehrkräfte`);
