import { redirect } from 'next/navigation';
import { Card, Logo } from '@sp/ui';
import { OnboardingFlow } from '../../src/components/onboarding/onboarding-flow';
import { AppProviders } from '../../src/components/providers';
import { getMe } from '../../src/lib/api-server';
import { isFormalView } from '../../src/lib/formal';
import { navigationOf, getT } from '../../src/lib/nav-server';

/**
 * Onboarding (ADR 0020): offene Pflichtschritte führen hierher; mit ?wiederholen (Hilfe und Tour) jederzeit alle
 * Schritte. Außerhalb des App-Rahmens, damit dessen Umleitung nicht kreist.
 */
export default async function WillkommenPage({
  searchParams,
}: {
  searchParams: Promise<{ wiederholen?: string }>;
}) {
  const r = await getMe();
  if (!r.ok) redirect('/login');
  const { me } = r;
  if (me.stage === 'NEEDS_2FA_VERIFY') redirect('/2fa');
  if (me.stage === 'NEEDS_2FA_SETUP') redirect('/2fa/einrichten');
  const nav = await navigationOf(me);
  const home = nav.home;
  const replay = (await searchParams).wiederholen !== undefined && !me.needsOnboarding;
  if (!me.needsOnboarding && !replay) redirect(home);
  const t = await getT('app');
  return (
    <AppProviders
      csrfToken={me.csrfToken}
      personId={me.user.personId}
      tenantSlug={me.tenant.slug}
      clearAfterIdleDays={me.tenant.offlineClearAfterIdleDays}
      formal={isFormalView(nav.view)}
    >
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 px-4 pt-6 lg:max-w-4xl lg:justify-center lg:py-8">
        <Logo className="self-center" label={t('name')} />
        <Card className="p-4 sm:p-6 lg:p-8">
          <OnboardingFlow
            firstName={me.user.firstName}
            lastName={me.user.lastName}
            school={me.tenant.name}
            home={home}
            noticeUrl={me.tenant.privacyNoticeUrl}
            replay={replay}
          />
        </Card>
      </main>
    </AppProviders>
  );
}
