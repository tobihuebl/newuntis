import { redirect } from 'next/navigation';
import { navigationFor } from '@sp/shared';
import { getMe } from '../src/lib/api-server';

/** Einstieg: je nach Zustand zur Anmeldung, zur Zwei-Faktor-Seite oder zur Startseite der Rolle. */
export default async function Home() {
  const r = await getMe();
  if (!r.ok) redirect('/login');
  if (r.me.stage === 'NEEDS_2FA_VERIFY') redirect('/2fa');
  if (r.me.stage === 'NEEDS_2FA_SETUP') redirect('/2fa/einrichten');
  if (r.me.needsOnboarding) redirect('/willkommen');
  redirect(navigationFor(r.me.user.roles.map((x) => x.role)).home);
}
