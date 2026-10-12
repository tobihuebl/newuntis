/** Gewählte Ansicht bei mehreren Rollen ("Rolle wechseln"), nur die Rollenkennung, keine personenbezogenen Daten. */
export const ROLE_COOKIE = 'pf-role';

export function setRoleView(role: string): void {
  document.cookie = `${ROLE_COOKIE}=${encodeURIComponent(role)}; Max-Age=31536000; Path=/; SameSite=Lax`;
}
