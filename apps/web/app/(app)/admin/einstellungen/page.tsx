import { SettingsScreen } from '../../../../src/components/admin/settings-screen';
import { adminPage } from '../../../../src/lib/admin';

export default async function EinstellungenPage() {
  const { readOnly } = await adminPage('/admin/einstellungen');
  return <SettingsScreen readOnly={readOnly} />;
}
