import { TokenPasswordForm } from '../../../src/components/token-password-form';

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <TokenPasswordForm kind="invite" token={token ?? ''} />;
}
