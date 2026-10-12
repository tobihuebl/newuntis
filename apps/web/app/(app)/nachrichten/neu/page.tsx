import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { can } from '@sp/shared';
import { ComposeScreen } from '../../../../src/components/messages/compose-screen';
import { requireRoute } from '../../../../src/lib/route-guard';

export default async function NeueNachrichtPage() {
  const me = await requireRoute('/nachrichten/neu');
  if (!can({ personId: me.user.personId, roles: me.user.roles.map((r) => r.role) }, 'message.send'))
    redirect('/nachrichten');
  return (
    <Suspense>
      <ComposeScreen />
    </Suspense>
  );
}
