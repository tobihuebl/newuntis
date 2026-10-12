import { Suspense } from 'react';
import { can } from '@sp/shared';
import { InboxScreen } from '../../../src/components/messages/inbox-screen';
import { MessagesSplit } from '../../../src/components/messages/messages-split';
import { requireRoute } from '../../../src/lib/route-guard';

/** Gemeinsamer Rahmen für Posteingang, Gespräch und Rundschreiben (zweispaltig ab 1024 px). */
export default async function NachrichtenLayout({ children }: { children: React.ReactNode }) {
  const me = await requireRoute('/nachrichten');
  const user = { personId: me.user.personId, roles: me.user.roles.map((r) => r.role) };
  return (
    <MessagesSplit
      inbox={
        <Suspense>
          <InboxScreen
            canSend={can(user, 'message.send')}
            canAnnounce={can(user, 'announcement.send')}
          />
        </Suspense>
      }
    >
      {children}
    </MessagesSplit>
  );
}
