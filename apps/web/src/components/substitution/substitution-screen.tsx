'use client';
import { Send } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  addDays,
  SUBSTITUTION_KINDS,
  TEACHER_ABSENCE_KINDS,
  type PlanEntry,
  type PlanResponse,
  type SubstitutionDay,
  type SubstitutionItem,
  type SubstitutionKindName,
  type Suggestion,
} from '@sp/shared';
import {
  Chip,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Input,
  SegmentedControl,
  Select,
  Sheet,
  Skeleton,
  cn,
  useToast,
} from '@sp/ui';
import { dateTimeOf, longDate, timeOf, todayVienna } from '../../lib/dates';
import { useApi, useApiMutation, useProblemText } from '../../lib/use-api';
import { periodLabel } from '../today/lesson-row';
import { useT } from '../../lib/i18n';
import { PageTitle } from '../page-title';
import { FormError } from '../form-bits';

interface Directory {
  classes: { id: string; name: string }[];
  teachers: { id: string; name: string }[];
  rooms: { id: string; name: string }[];
}
const PERIODS = Array.from({ length: 10 }, (_, i) => ({
  value: String(i + 1),
  label: `${i + 1}.`,
}));

/** Supplierung planen und veröffentlichen (SU-01 bis SU-04, Direktion und Administration). */
export function SubstitutionScreen() {
  const t = useT('substitution');
  const router = useRouter();
  const date = useSearchParams().get('datum') ?? todayVienna();
  const q = useApi<SubstitutionDay>(['substitutions', date], `/substitutions?date=${date}`);
  const directory = useApi<Directory>(['directory'], '/timetable/directory');
  const publish = useApiMutation<object, { published: number }>(
    'POST',
    () => '/substitutions/publish',
    [['substitutions']],
  );
  const [editing, setEditing] = useState<SubstitutionItem | null>(null);
  const [creating, setCreating] = useState<PlanEntry | null>(null);
  const [absenceOpen, setAbsenceOpen] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const toast = useToast();
  const go = (d: string) => router.replace(`/supplierung?datum=${d}`);
  const items = q.data?.items ?? [];
  const pending = items.filter((i) => i.status === 'ASSIGNED');

  return (
    <div className="mx-auto flex w-full max-w-(--content-max) flex-col gap-6 px-4 pt-4 pb-8 lg:px-6 lg:pt-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <PageTitle area="direktion">{t('title')}</PageTitle>
          <p className="text-body-sm text-ink-muted">{longDate(date)}</p>
        </div>
        <nav aria-label={t('title')} className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => go(addDays(date, -1))}>
            {t('prevDay')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => go(todayVienna())}>
            {t('today')}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => go(addDays(date, 1))}>
            {t('nextDay')}
          </Button>
        </nav>
      </header>

      {/* Ab 1024 px zweispaltig: Ausfälle links, Stunden mit Aktionen rechts (Design System, Supplierung) */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="flex flex-col gap-6">
          <AbsentTeachers day={q.data} onAdd={() => setAbsenceOpen(true)} />
          <ChangeLesson date={date} directory={directory.data} onPick={setCreating} />
        </div>

        <div className="flex flex-col gap-6">
          {q.isPending ? (
            <Skeleton className="h-40 w-full" />
          ) : items.length === 0 ? (
            <Card flat>
              <EmptyState title={t('none')} />
            </Card>
          ) : (
            <>
              <ItemSection
                title={t('open')}
                items={items.filter((i) => i.status === 'OPEN')}
                onEdit={setEditing}
                tone="late"
              />
              <ItemSection
                title={t('assigned')}
                items={pending}
                onEdit={setEditing}
                tone="absent"
              />
              <ItemSection
                title={t('published')}
                items={items.filter((i) => i.status === 'PUBLISHED')}
                onEdit={setEditing}
                tone="ok"
              />
            </>
          )}

          {/* Veröffentlichen ist nicht umkehrbar: angeheftet und mit Bestätigungs-Sheet (Design System, Interaktion) */}
          <div className="sticky bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] z-nav -mx-4 bg-bg px-4 py-3 lg:bottom-0 lg:mx-0 lg:px-0">
            <Button
              block
              iconLeft={Send}
              disabled={pending.length === 0 || publish.isPending}
              onClick={() => setConfirmPublish(true)}
            >
              {t('publish', { count: pending.length })}
            </Button>
          </div>
        </div>
      </div>

      <Sheet
        open={confirmPublish}
        onOpenChange={setConfirmPublish}
        title={t('publishConfirmTitle', { count: pending.length })}
        description={t('publishConfirmText')}
        closeLabel={t('cancel')}
      >
        <div className="flex flex-wrap gap-3">
          <Button
            iconLeft={Send}
            loading={publish.isPending}
            onClick={async () => {
              const r = await publish.mutateAsync({ date });
              setConfirmPublish(false);
              toast({ text: t('publishedOk', { count: r.published }) });
            }}
          >
            {t('publishNow')}
          </Button>
          <Button variant="secondary" onClick={() => setConfirmPublish(false)}>
            {t('cancel')}
          </Button>
        </div>
      </Sheet>

      <ActionSheet
        item={editing}
        entry={creating}
        rooms={q.data?.rooms ?? []}
        onClose={() => {
          setEditing(null);
          setCreating(null);
        }}
      />
      <AbsenceSheet
        open={absenceOpen}
        date={date}
        teachers={directory.data?.teachers ?? []}
        onClose={() => setAbsenceOpen(false)}
      />
    </div>
  );
}

function summary(t: ReturnType<typeof useT>, i: SubstitutionItem): string {
  const action = t(`actions.${i.kind}`);
  if ((i.kind === 'SUBSTITUTE' || i.kind === 'SUPERVISION') && i.substitute)
    return `${action}: ${i.substitute.name}`;
  if (i.kind === 'ROOM_CHANGE' && i.newRoom) return `${action} → ${i.newRoom.name}`;
  return i.status === 'OPEN' ? '' : action;
}

function ItemSection({
  title,
  items,
  onEdit,
  tone,
}: {
  title: string;
  items: SubstitutionItem[];
  onEdit: (i: SubstitutionItem) => void;
  tone: 'late' | 'absent' | 'ok';
}) {
  const t = useT('substitution');
  const tt = useT('today');
  if (items.length === 0) return null;
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 text-h2">
        {title} <Chip tone={tone}>{items.length}</Chip>
      </h2>
      <Card className="p-0">
        <ul>
          {items.map((i) => (
            <li
              key={i.id}
              className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-b-0"
              data-substitution={i.status}
            >
              <div className="w-20 shrink-0">
                <p className="text-mono">{timeOf(i.occurrence.startsAt)}</p>
                <p className="text-caption text-ink-muted">{periodLabel(tt, i.occurrence)}</p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-body-strong">
                  {i.occurrence.class?.name ?? i.occurrence.group?.name} ·{' '}
                  {i.occurrence.subject.name}
                </p>
                <p className="text-body-sm text-ink-muted">
                  {t('planned')}:{' '}
                  {i.plannedTeachers
                    .map((p) =>
                      p.id === i.absentTeacher?.id ? `${p.name} (${t('absent')})` : p.name,
                    )
                    .join(', ') || '–'}
                  {i.occurrence.room ? ` · ${i.occurrence.room.name}` : ''}
                </p>
                {summary(t, i) ? <p className="text-label">{summary(t, i)}</p> : null}
                {i.changedAfterPublish ? <Chip tone="late">{t('changed')}</Chip> : null}
              </div>
              <Button variant="secondary" onClick={() => onEdit(i)}>
                {t('choose')}
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

/** Aktion festlegen: Vertretung mit Vorschlägen, Entfall, Raumwechsel, Betreuung. */
function ActionSheet({
  item,
  entry,
  rooms,
  onClose,
}: {
  item: SubstitutionItem | null;
  entry: PlanEntry | null;
  rooms: { id: string; name: string }[];
  onClose: () => void;
}) {
  const t = useT('substitution');
  const tc = useT('common');
  const problem = useProblemText();
  const target = item?.occurrence ?? entry;
  const [kind, setKind] = useState<SubstitutionKindName>('SUBSTITUTE');
  const [teacher, setTeacher] = useState('');
  const [room, setRoom] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    setKind(item && item.status !== 'OPEN' ? item.kind : entry ? 'CANCEL' : 'SUBSTITUTE');
    setTeacher(item?.substitute?.id ?? '');
    setRoom(item?.newRoom?.id ?? '');
    setNote(item?.note ?? '');
  }, [item, entry]);
  const sug = useApi<{ teachers: Suggestion[]; freeRooms: { id: string; name: string }[] }>(
    ['suggestions', item?.id],
    item ? `/substitutions/${item.id}/suggestions` : null,
  );
  const save = useApiMutation<object>('PATCH', () => `/substitutions/${item?.id}`, [
    ['substitutions'],
  ]);
  const create = useApiMutation<object>('POST', () => '/substitutions', [['substitutions']]);
  const remove = useApiMutation<string>('DELETE', (id) => `/substitutions/${id}`, [
    ['substitutions'],
  ]);
  const needsTeacher = kind === 'SUBSTITUTE' || kind === 'SUPERVISION';
  const roomOptions = (sug.data?.freeRooms ?? rooms).map((r) => ({ value: r.id, label: r.name }));
  const body = {
    kind,
    substituteTeacherId: needsTeacher ? teacher || null : null,
    newRoomId: kind === 'CANCEL' ? null : room || null,
    note: note || null,
  };
  const error = save.error ?? create.error ?? remove.error;

  return (
    <Sheet
      open={target !== null}
      onOpenChange={(o) => (o ? undefined : onClose())}
      title={
        target ? `${target.class?.name ?? target.group?.name ?? ''} · ${target.subject.name}` : ''
      }
      description={target ? `${longDate(target.date)}, ${timeOf(target.startsAt)}` : undefined}
      closeLabel={tc('close')}
    >
      <SegmentedControl
        label={t('action')}
        value={kind}
        onChange={setKind}
        options={SUBSTITUTION_KINDS.map((k) => ({ value: k, label: t(`actions.${k}`) }))}
      />
      {needsTeacher ? (
        item ? (
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-label">{t('suggestions')}</legend>
            {!sug.data ? (
              <Skeleton className="h-24 w-full" />
            ) : sug.data.teachers.length === 0 ? (
              <p className="text-body-sm text-ink-muted">{t('noSuggestions')}</p>
            ) : (
              <ul className="max-h-64 overflow-y-auto rounded-sm border border-line">
                {sug.data.teachers.map((s) => (
                  <li key={s.teacher.id} className="border-b border-line last:border-b-0">
                    <label
                      className={cn(
                        'flex min-h-12 cursor-pointer items-center gap-3 px-3',
                        teacher === s.teacher.id && 'bg-bg-sunken',
                      )}
                    >
                      <input
                        type="radio"
                        name="substitute"
                        value={s.teacher.id}
                        checked={teacher === s.teacher.id}
                        onChange={() => setTeacher(s.teacher.id)}
                        className="size-4 accent-brand"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-body-strong">{s.teacher.name}</span>
                        <span className="block text-caption text-ink-muted">
                          {t('fairness', { n: s.count })}
                        </span>
                      </span>
                      {s.teachesSubject ? <Chip tone="ok">{t('teachesSubject')}</Chip> : null}
                      {s.knowsClass ? <Chip tone="ok">{t('knowsClass')}</Chip> : null}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
        ) : null
      ) : null}
      {kind !== 'CANCEL' ? (
        <Select
          label={kind === 'ROOM_CHANGE' ? t('room') : t('roomOptional')}
          value={room}
          emptyLabel="–"
          onChange={(e) => setRoom(e.target.value)}
          options={roomOptions}
        />
      ) : null}
      <Input
        label={t('note')}
        value={note}
        maxLength={500}
        onChange={(e) => setNote(e.target.value)}
      />
      {error ? <FormError message={problem(error)} /> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={(needsTeacher && !teacher && !!item) || (kind === 'ROOM_CHANGE' && !room)}
          onClick={async () => {
            if (item) await save.mutateAsync(body);
            else if (entry) await create.mutateAsync({ occurrenceId: entry.id, ...body });
            onClose();
          }}
        >
          {t('save')}
        </Button>
        {item ? (
          <Button
            variant="ghost"
            onClick={async () => {
              await remove.mutateAsync(item.id);
              onClose();
            }}
          >
            {t('remove')}
          </Button>
        ) : null}
      </div>
    </Sheet>
  );
}

function AbsentTeachers({ day, onAdd }: { day: SubstitutionDay | undefined; onAdd: () => void }) {
  const t = useT('substitution');
  const del = useApiMutation<string>('DELETE', (id) => `/teacher-absences/${id}`, [
    ['substitutions'],
  ]);
  return (
    <section aria-labelledby="absent" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="absent" className="text-h3">
          {t('absentTeachers')}
        </h2>
        <Button variant="secondary" onClick={onAdd}>
          {t('addAbsence')}
        </Button>
      </div>
      {!day ? null : day.absences.length === 0 ? (
        <p className="text-ink-muted">{t('noAbsent')}</p>
      ) : (
        <Card className="p-0">
          <ul>
            {day.absences.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2 last:border-b-0"
              >
                <div>
                  <p className="text-body-strong">{a.teacher.name}</p>
                  <p className="text-body-sm text-ink-muted">
                    {t(`kinds.${a.kind}`)} · {dateTimeOf(a.fromAt)} – {dateTimeOf(a.toAt)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (window.confirm(t('deleteAbsenceConfirm'))) del.mutate(a.id);
                  }}
                >
                  {t('deleteAbsence')}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

function AbsenceSheet({
  open,
  date,
  teachers,
  onClose,
}: {
  open: boolean;
  date: string;
  teachers: { id: string; name: string }[];
  onClose: () => void;
}) {
  const t = useT('substitution');
  const ts = useT('sick');
  const tc = useT('common');
  const problem = useProblemText();
  const create = useApiMutation<object>('POST', () => '/teacher-absences', [['substitutions']]);
  const [teacherId, setTeacherId] = useState('');
  const [from, setFrom] = useState(date);
  const [to, setTo] = useState(date);
  const [kind, setKind] = useState<(typeof TEACHER_ABSENCE_KINDS)[number]>('SICK');
  const [partial, setPartial] = useState(false);
  const [fp, setFp] = useState('1');
  const [tp, setTp] = useState('6');
  useEffect(() => {
    setFrom(date);
    setTo(date);
  }, [date, open]);
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => (o ? undefined : onClose())}
      title={t('addAbsence')}
      closeLabel={tc('close')}
    >
      <Select
        label={t('teacher')}
        value={teacherId}
        emptyLabel="–"
        onChange={(e) => setTeacherId(e.target.value)}
        options={teachers.map((x) => ({ value: x.id, label: x.name }))}
      />
      <div className="flex flex-wrap gap-3">
        <Input
          label={ts('from')}
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="w-44"
        />
        <Input
          label={ts('to')}
          type="date"
          value={to}
          min={from}
          onChange={(e) => setTo(e.target.value)}
          className="w-44"
        />
      </div>
      <Checkbox
        label={ts('onlyLessons')}
        checked={partial}
        onChange={(e) => setPartial(e.target.checked)}
      />
      {partial ? (
        <div className="flex flex-wrap gap-3">
          <Select
            label={ts('fromPeriod')}
            value={fp}
            onChange={(e) => setFp(e.target.value)}
            options={PERIODS}
          />
          <Select
            label={ts('toPeriod')}
            value={tp}
            onChange={(e) => setTp(e.target.value)}
            options={PERIODS}
          />
        </div>
      ) : null}
      <Select
        label={t('kind')}
        value={kind}
        onChange={(e) => setKind(e.target.value as typeof kind)}
        options={TEACHER_ABSENCE_KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) }))}
      />
      {create.error ? <FormError message={problem(create.error)} /> : null}
      <Button
        disabled={!teacherId || create.isPending}
        className="self-start"
        onClick={async () => {
          await create.mutateAsync({
            teacherId,
            fromDate: from,
            toDate: to,
            kind,
            fromPeriod: partial ? Number(fp) : null,
            toPeriod: partial ? Number(tp) : null,
          });
          onClose();
        }}
      >
        {tc('save')}
      </Button>
    </Sheet>
  );
}

/** Stunde ändern ohne Abwesenheit (Ausflug, Raumwechsel, Entfall): Klasse wählen, dann Stunde. */
function ChangeLesson({
  date,
  directory,
  onPick,
}: {
  date: string;
  directory: Directory | undefined;
  onPick: (e: PlanEntry) => void;
}) {
  const t = useT('substitution');
  const tt = useT('today');
  const [classId, setClassId] = useState('');
  const plan = useApi<PlanResponse>(
    ['class-day', classId, date],
    classId ? `/classes/${classId}/timetable?from=${date}&to=${date}` : null,
  );
  return (
    <section aria-labelledby="change" className="flex flex-col gap-2">
      <h2 id="change" className="text-h3">
        {t('changeLesson')}
      </h2>
      <p className="text-body-sm text-ink-muted">{t('changeLessonHelp')}</p>
      <Select
        label={t('class')}
        value={classId}
        emptyLabel="–"
        onChange={(e) => setClassId(e.target.value)}
        options={(directory?.classes ?? []).map((c) => ({ value: c.id, label: c.name }))}
      />
      {classId && plan.data ? (
        plan.data.entries.length === 0 ? (
          <p className="text-ink-muted">{t('noLessons')}</p>
        ) : (
          <Card className="p-0">
            <ul>
              {plan.data.entries.map((e) => (
                <li key={e.id} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    disabled={e.planned || e.status !== 'SCHEDULED'}
                    onClick={() => onPick(e)}
                    className="flex min-h-12 w-full items-center gap-3 px-4 text-left hover:bg-bg-sunken disabled:opacity-60"
                  >
                    <span className="w-24 shrink-0 text-body-sm tabular-nums">
                      {timeOf(e.startsAt)} · {periodLabel(tt, e)}
                    </span>
                    <span className="flex-1">
                      {e.subject.name} · {e.teachers.map((x) => x.name).join(', ')}
                    </span>
                    {e.status !== 'SCHEDULED' ? (
                      <span className="text-body-sm text-ink-muted">{t('alreadyChanged')}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )
      ) : null}
    </section>
  );
}
