import { notFound, redirect } from 'next/navigation';
import { can } from '@sp/shared';
import {
  TimetableEditor,
  type EditorPayload,
} from '../../../../../src/components/timetable/editor';
import { apiFetch } from '../../../../../src/lib/api-server';
import { todayVienna } from '../../../../../src/lib/dates';
import { requireRoute } from '../../../../../src/lib/route-guard';

export default async function TimetableEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireRoute(`/admin/stundenplan/${id}`);
  const user = { personId: me.user.personId, roles: me.user.roles.map((r) => r.role) };
  if (!can(user, 'timetable.publish')) redirect('/');
  const res = await apiFetch(`/admin/timetable-versions/${encodeURIComponent(id)}`);
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`API: ${res.status}`);
  const payload = (await res.json()) as EditorPayload;
  return (
    <TimetableEditor
      key={payload.version.id + payload.version.status}
      initial={payload}
      csrfToken={me.csrfToken}
      canEdit={can(user, 'timetable.edit')}
      canPublish={can(user, 'timetable.publish')}
      today={todayVienna()}
    />
  );
}
