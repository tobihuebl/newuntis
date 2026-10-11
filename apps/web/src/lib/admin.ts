import 'server-only';
import { redirect } from 'next/navigation';
import { can, type PolicyUser } from '@sp/shared';
import { requireRoute } from './route-guard';

/** Admin-Seiten: Route prüfen und feststellen, ob geschrieben werden darf (Direktion liest nur). */
export async function adminPage(pathname: string) {
  const me = await requireRoute(pathname);
  const user: PolicyUser = { personId: me.user.personId, roles: me.user.roles.map((r) => r.role) };
  if (!can(user, 'masterdata.read')) redirect('/');
  return { me, csrfToken: me.csrfToken, readOnly: !can(user, 'masterdata.write') };
}
