import { redirect } from 'next/navigation';
import { navViews, navigationFor, type OnboardingState } from '@sp/shared';
import { AppProviders } from '../../src/components/providers';
import { AppShell } from '../../src/components/shell/app-shell';
import { apiGet, getMe } from '../../src/lib/api-server';
import { isFormalView } from '../../src/lib/formal';
import { navigationOf, getT } from '../../src/lib/nav-server';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const r = await getMe();
  if (!r.ok) redirect('/login');
  const { me } = r;
  if (me.stage === 'NEEDS_2FA_VERIFY') redirect('/2fa');
  if (me.stage === 'NEEDS_2FA_SETUP') redirect('/2fa/einrichten');
  if (me.needsOnboarding) redirect('/willkommen');
  const t = await getT('roles');
  const roles = [...new Set(me.user.roles.map((x) => x.role))];
  const nav = await navigationOf(me);
  // Checkliste des Onboardings gleich mitliefern: kein Nachladen, kein Layout-Sprung auf der Startseite
  const onboarding = await apiGet<OnboardingState>('/me/onboarding').catch(() => null);
  const views = navViews(roles).map((role) => ({
    role,
    label: t(role),
    home: navigationFor(roles, role).home,
  }));
  return (
    <AppProviders
      csrfToken={me.csrfToken}
      personId={me.user.personId}
      tenantSlug={me.tenant.slug}
      clearAfterIdleDays={me.tenant.offlineClearAfterIdleDays}
      formal={isFormalView(nav.view)}
    >
      <AppShell
        view={nav.view}
        tabs={nav.tabs}
        sections={nav.sections}
        views={views}
        userName={`${me.user.firstName} ${me.user.lastName}`}
        roleLabel={nav.view ? t(nav.view) : ''}
        schoolName={me.tenant.name}
        csrfToken={me.csrfToken}
        home={nav.home}
        avatar={me.user.avatar}
        onboarding={onboarding}
      >
        {children}
      </AppShell>
    </AppProviders>
  );
}
