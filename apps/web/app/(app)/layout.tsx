import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { navigationFor } from '@sp/shared';
import { AppShell } from '../../src/components/app-shell';
import { getMe } from '../../src/lib/api-server';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const r = await getMe();
  if (!r.ok) redirect('/login');
  const { me } = r;
  if (me.stage === 'NEEDS_2FA_VERIFY') redirect('/2fa');
  if (me.stage === 'NEEDS_2FA_SETUP') redirect('/2fa/einrichten');
  const t = await getTranslations('roles');
  const roles = [...new Set(me.user.roles.map((x) => x.role))];
  const nav = navigationFor(roles);
  return (
    <AppShell
      tabs={nav.tabs}
      userName={`${me.user.firstName} ${me.user.lastName}`}
      roleLabels={roles.map((role) => t(role))}
      csrfToken={me.csrfToken}
    >
      {children}
    </AppShell>
  );
}
