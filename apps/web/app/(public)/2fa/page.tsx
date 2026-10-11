import { redirect } from 'next/navigation';
import { getMe } from '../../../src/lib/api-server';
import { TwoFactorForm } from '../../../src/components/two-factor-form';

export default async function TwoFactorPage() {
  const r = await getMe();
  if (!r.ok) redirect('/login');
  if (r.me.stage !== 'NEEDS_2FA_VERIFY') redirect('/');
  return <TwoFactorForm csrfToken={r.me.csrfToken} />;
}
