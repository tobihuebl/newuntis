import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { navigationFor } from '@sp/shared';
import { Card } from '@sp/ui';
import { OnboardingFlow } from '../../src/components/onboarding/onboarding-flow';
import { AppProviders } from '../../src/components/providers';
import { getMe } from '../../src/lib/api-server';

/** Einführung nach dem ersten Login; außerhalb des App-Rahmens, damit dessen Umleitung nicht kreist. */
export default async function WillkommenPage() {
  const r = await getMe();
  if (!r.ok) redirect('/login');
  const { me } = r;
  if (me.stage === 'NEEDS_2FA_VERIFY') redirect('/2fa');
  if (me.stage === 'NEEDS_2FA_SETUP') redirect('/2fa/einrichten');
  const roles = [...new Set(me.user.roles.map((x) => x.role))];
  const home = navigationFor(roles).home;
  if (!me.needsOnboarding) redirect(home);
  const t = await getTranslations('app');
  return (
    <AppProviders
      csrfToken={me.csrfToken}
      personId={me.user.personId}
      tenantSlug={me.tenant.slug}
      clearAfterIdleDays={me.tenant.offlineClearAfterIdleDays}
    >
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 p-4">
        <p className="text-center text-lg font-semibold text-primary">{t('name')}</p>
        <Card className="p-6">
          <OnboardingFlow
            firstName={me.user.firstName}
            school={me.tenant.name}
            roles={roles}
            home={home}
            noticeUrl={me.tenant.privacyNoticeUrl}
          />
        </Card>
      </main>
    </AppProviders>
  );
}
