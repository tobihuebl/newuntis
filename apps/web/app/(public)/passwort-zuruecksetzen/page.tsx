import { TokenPasswordForm } from '../../../src/components/token-password-form';

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <TokenPasswordForm kind="reset" token={token ?? ''} />;
}
