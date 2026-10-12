import { getTranslations } from 'next-intl/server';
import { ProfileScreen } from '../../../src/components/profile/profile-screen';
import { requireRoute } from '../../../src/lib/route-guard';

/** Profil (PL-03): Benachrichtigungen, Darstellung, Sprache, Sicherheit und Geräte. */
export default async function ProfilPage() {
  const me = await requireRoute('/profil');
  const t = await getTranslations('roles');
  const roles = [...new Set(me.user.roles.map((r) => r.role))];
  return (
    <ProfileScreen
      name={`${me.user.firstName} ${me.user.lastName}`}
      email={me.user.email}
      roleLabels={roles.map((r) => t(r))}
      twoFactor={me.user.twoFactorEnabled}
      isTeacher={roles.includes('TEACHER') || roles.includes('HOMEROOM')}
    />
  );
}
