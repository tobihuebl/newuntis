import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, type Page } from '@playwright/test';
import * as OTPAuth from 'otpauth';

export const PASSWORD = 'demo-passwort-1';
const STATE_FILE = resolve(__dirname, '.state.json');
const SECRETS_FILE = resolve(__dirname, '.state-totp.json');

/** Von global-setup ermittelte Demo-Konten. */
export const accounts = () =>
  JSON.parse(readFileSync(STATE_FILE, 'utf8')) as {
    teacherEmail: string;
    adminEmail: string;
    studentEmail: string;
    principalEmail: string;
    guardianEmail: string;
    databaseUrl: string;
  };

type Secrets = Record<string, { secret: string; step: number }>;
const readSecrets = (): Secrets =>
  existsSync(SECRETS_FILE) ? (JSON.parse(readFileSync(SECRETS_FILE, 'utf8')) as Secrets) : {};

/**
 * Gültiger, noch nicht benutzter Code: der Server lässt jede 30-s-Scheibe nur einmal zu und erlaubt
 * eine Scheibe Abweichung. Die zuletzt benutzte Scheibe je Konto steht in einer Zustandsdatei.
 */
function totp(email: string, secret: string): string {
  const all = readSecrets();
  const last = all[email]?.step ?? -1;
  const now = Math.floor(Date.now() / 30_000);
  const step = [now - 1, now, now + 1].find((s) => s > last) ?? now + 1;
  writeFileSync(SECRETS_FILE, JSON.stringify({ ...all, [email]: { secret, step } }));
  return new OTPAuth.TOTP({
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  }).generate({ timestamp: step * 30_000 + 1 });
}

/** Anmelden; der zweite Faktor wird beim ersten Mal eingerichtet, danach bestätigt. */
export async function login(page: Page, email: string, landing: RegExp) {
  await page.goto('/login');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort').fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  // nach dem Login kurz über "/" zur Zielseite oder zum zweiten Faktor
  await page.waitForURL((u) => u.pathname !== '/login' && u.pathname !== '/');
  if (page.url().includes('/2fa/einrichten')) {
    await page.getByRole('button', { name: 'Einrichtung starten' }).click();
    const secret = (await page.locator('code').textContent())!.trim();
    await page.getByLabel('Code').fill(totp(email, secret));
    await page.getByRole('button', { name: 'Aktivieren' }).click();
    await page.getByRole('button', { name: 'Ich habe die Codes gespeichert' }).click();
  } else if (new URL(page.url()).pathname === '/2fa') {
    const saved = readSecrets()[email];
    expect(saved, `kein TOTP-Geheimnis für ${email}`).toBeTruthy();
    await page.getByLabel('Code').fill(totp(email, saved!.secret));
    await page.getByLabel('Code').press('Enter');
  }
  // Beim ersten Login: Einführung mit Datenschutzhinweis (M6); Umleitungen erst abwarten
  await page.waitForURL((u) => u.pathname === '/willkommen' || landing.test(u.href));
  await page.waitForLoadState('networkidle');
  if (new URL(page.url()).pathname === '/willkommen') await completeOnboarding(page);
  await expect(page).toHaveURL(landing);
}

/** Einführung durchklicken: Datenschutzhinweis bestätigen, Push überspringen, Hinweise lesen. */
export async function completeOnboarding(page: Page) {
  await page.getByLabel('Ich habe den Datenschutzhinweis gelesen.').check();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Los geht’s' }).click();
}
