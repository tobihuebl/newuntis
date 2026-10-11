import { RoomsManager, type RoomRow } from '../../../../src/components/admin/managers';
import { adminPage } from '../../../../src/lib/admin';
import { apiGet } from '../../../../src/lib/api-server';

export default async function RoomsPage() {
  const { csrfToken, readOnly } = await adminPage('/admin/raeume');
  const { data } = await apiGet<{ data: RoomRow[] }>('/admin/rooms');
  return <RoomsManager rows={data} csrfToken={csrfToken} readOnly={readOnly} />;
}
