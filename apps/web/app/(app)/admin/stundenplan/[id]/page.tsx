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
  // Stundenplan-Assistent nur verlinken, wenn die Schule ihn freigeschaltet hat (ADR 0012)
  const canEdit = can(user, 'timetable.edit');
  const status = canEdit ? await apiFetch('/admin/planning/status') : null;
  const assistant = status?.ok ? ((await status.json()) as { enabled: boolean }).enabled : false;
  return (
    <TimetableEditor
      key={payload.version.id + payload.version.status}
      initial={payload}
      csrfToken={me.csrfToken}
      canEdit={canEdit}
      assistant={assistant}
      canPublish={can(user, 'timetable.publish')}
      today={todayVienna()}
    />
  );
}
