'use client';
import { Pin } from 'lucide-react';
import { useState } from 'react';
import { fachColorOf, type LessonRule, type PeriodInfo } from '@sp/shared';
import { Select, TimetableCell, TimetableGrid } from '@sp/ui';
import { useT } from '../../lib/i18n';

export interface PreviewData {
  lessons: (LessonRule & { pinned?: boolean })[];
  periods: PeriodInfo[];
  subjects: { id: string; name: string; code: string; color: string | null }[];
  classes: { id: string; name: string }[];
  rooms: { id: string; name: string }[];
  teachers: { id: string; firstName: string; lastName: string }[];
}

/** Vorschau eines Vorschlags je Klasse (nur lesen): Fächerkacheln wie im Stundenplan, festgepinnte mit Nadel. */
export function PlanPreview({ data }: { data: PreviewData }) {
  const t = useT('assistant');
  const td = useT('days');
  const [classId, setClassId] = useState(data.classes[0]?.id ?? '');
  const subject = new Map(data.subjects.map((s) => [s.id, s]));
  const room = new Map(data.rooms.map((r) => [r.id, r.name]));
  const teacher = new Map(data.teachers.map((x) => [x.id, x.lastName]));
  const periods = [...data.periods].sort((a, b) => a.number - b.number);
  const rowOf = new Map(periods.map((p, i) => [p.number, i]));
  const shown = data.lessons.filter((l) => l.classId === classId);

  return (
    <div className="flex flex-col gap-3">
      <Select
        label={t('previewClass')}
        value={classId}
        onChange={(e) => setClassId(e.target.value)}
        options={data.classes.map((c) => ({ value: c.id, label: c.name }))}
        fieldClassName="max-w-xs"
      />
      <div className="overflow-x-auto">
        <TimetableGrid
          className="min-w-[26rem]"
          ariaLabel={t('previewLabel')}
          columns={[1, 2, 3, 4, 5].map((d) => ({ key: String(d), label: td(`short${d}`) }))}
          rows={periods.map((p) => ({
            key: String(p.number),
            label: String(p.number),
            title: `${p.startTime} – ${p.endTime}`,
          }))}
        >
          {shown.map((l) => {
            const sub = subject.get(l.subjectId);
            return (
              <TimetableCell
                key={l.id}
                column={l.weekday - 1}
                row={rowOf.get(l.periodStart) ?? 0}
                span={l.periodCount}
                fach={sub ? fachColorOf(sub) : 'sand'}
              >
                <span>
                  {l.pinned ? (
                    <Pin aria-label={t('pinned')} className="mr-0.5 inline size-3" />
                  ) : null}
                  {sub?.code ?? '?'}
                </span>
                <small className="max-w-full truncate">
                  {l.teacherIds.map((id) => teacher.get(id) ?? '?').join(', ')}
                </small>
                {l.roomId ? (
                  <small className="max-w-full truncate">{room.get(l.roomId)}</small>
                ) : null}
              </TimetableCell>
            );
          })}
        </TimetableGrid>
      </div>
    </div>
  );
}
