import { redirect } from 'next/navigation';
import { getMe } from '../../../../src/lib/api-server';
import { TwoFactorSetup } from '../../../../src/components/two-factor-setup';

export default async function TwoFactorSetupPage() {
  const r = await getMe();
  if (!r.ok) redirect('/login');
  if (r.me.stage === 'NEEDS_2FA_VERIFY') redirect('/2fa');
  return <TwoFactorSetup csrfToken={r.me.csrfToken} />;
}
