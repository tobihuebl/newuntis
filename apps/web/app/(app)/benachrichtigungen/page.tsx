import { NotificationList } from '../../../src/components/notifications/notification-list';
import { requireRoute } from '../../../src/lib/route-guard';

export default async function BenachrichtigungenPage() {
  await requireRoute('/benachrichtigungen');
  return <NotificationList />;
}
