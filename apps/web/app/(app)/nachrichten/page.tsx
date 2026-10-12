import { Suspense } from 'react';
import { can } from '@sp/shared';
import { InboxScreen } from '../../../src/components/messages/inbox-screen';
import { requireRoute } from '../../../src/lib/route-guard';

export default async function NachrichtenPage() {
  const me = await requireRoute('/nachrichten');
  const user = { personId: me.user.personId, roles: me.user.roles.map((r) => r.role) };
  return (
    <Suspense>
      <InboxScreen
        canSend={can(user, 'message.send')}
        canAnnounce={can(user, 'announcement.send')}
      />
    </Suspense>
  );
}
