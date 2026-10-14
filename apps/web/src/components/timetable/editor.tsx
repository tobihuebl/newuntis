'use client';
import { Check, Pin, Plus, Redo2, Sparkles, Trash2, TriangleAlert, Undo2, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  checkConstraints,
  fachColorOf,
  validateTimetable,
  type Conflict,
  type CoverageRow,
  type PlanningConstraint,
  type LessonRule,
  type PeriodInfo,
  type ValidationContext,
  type WeekPattern,
} from '@sp/shared';
import { Banner, Chip, Button, Card, Checkbox, Input, Select, Sheet, Switch, cn } from '@sp/ui';
import { ApiError, apiRequest } from '../../lib/api-client';
import { useT } from '../../lib/i18n';
import { PageTitle } from '../page-title';

// ───────────────────────── Typen ─────────────────────────
type EditorLesson = LessonRule & { version: number; pinned?: boolean };
type Fields = Omit<LessonRule, 'id'>;
interface Requirement {
  id: string;
  subjectId: string;
  classId: string | null;
  groupId: string | null;
  teacherId: string;
  hoursPerWeek: number;
  preferDouble: boolean;
}
export interface EditorPayload {
  version: {
    id: string;
    name: string | null;
    status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
    validFrom: string;
    publishedAt: string | null;
    schoolYear: { id: string; name: string; startsOn: string; endsOn: string };
  };
  lessons: EditorLesson[];
  requirements: Requirement[];
  periods: PeriodInfo[];
  context: ValidationContext;
  subjects: { id: string; name: string; code: string; color: string | null }[];
  classes: { id: string; name: string }[];
  groups: { id: string; name: string }[];
  rooms: { id: string; name: string; capacity: number | null }[];
  teachers: { id: string; firstName: string; lastName: string }[];
  /** Aktive Planungswünsche des Schuljahres (M7); Verstöße sind Warnungen. */
  constraints?: PlanningConstraint[];
  coverage?: CoverageRow[];
}
type ViewKind = 'class' | 'teacher' | 'room';
type Op =
  | { kind: 'create'; fields: Fields; replaces?: string }
  | { kind: 'delete'; id: string }
  | { kind: 'update'; id: string; after: Partial<Fields> };
type SheetState =
  | { mode: 'edit'; id: string }
  | { mode: 'new'; fields: Fields }
  | { mode: 'publish' }
  | { mode: 'requirement' }
  | null;

const fieldsOf = (l: LessonRule): Fields => ({
  weekday: l.weekday,
  periodStart: l.periodStart,
  periodCount: l.periodCount,
  weekPattern: l.weekPattern,
  subjectId: l.subjectId,
  classId: l.classId,
  groupId: l.groupId,
  roomId: l.roomId,
  teacherIds: [...l.teacherIds],
});
const DAYS = [1, 2, 3, 4, 5];

export function TimetableEditor({
  initial,
  csrfToken,
  canEdit,
  canPublish,
  today,
  assistant = false,
}: {
  initial: EditorPayload;
  csrfToken: string;
  canEdit: boolean;
  canPublish: boolean;
  today: string;
  /** Stundenplan-Assistent freigeschaltet: Link "Vorschlag erstellen" (M7). */
  assistant?: boolean;
}) {
  const t = useT('timetable');
  const d = useT('days');
  const c = useT('common');
  const router = useRouter();
  const editable = canEdit && initial.version.status === 'DRAFT';
  const { periods, context, subjects, classes, groups, rooms, teachers } = initial;
  const constraints = initial.constraints ?? [];

  const [lessons, setLessons] = useState<EditorLesson[]>(initial.lessons);
  const [requirements, setRequirements] = useState<Requirement[]>(initial.requirements);
  const [view, setView] = useState<{ kind: ViewKind; id: string }>({
    kind: 'class',
    id: classes[0]?.id ?? '',
  });
  const [selection, setSelection] = useState<
    { type: 'lesson'; id: string } | { type: 'pool'; id: string } | null
  >(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [undoStack, setUndo] = useState<Op[]>([]);
  const [redoStack, setRedo] = useState<Op[]>([]);
  const [status, setStatus] = useState<{
    state: 'idle' | 'saving' | 'saved' | 'error';
    message?: string;
  }>({ state: 'idle' });
  const [publishResult, setPublishResult] = useState<{
    error?: string;
    conflicts?: Conflict[];
    coverage?: CoverageRow[];
    created?: number;
  } | null>(null);
  const [acceptCoverage, setAcceptCoverage] = useState(false);
  const aliases = useRef(new Map<string, string>()); // nach Rückgängig/Wiederholen neu angelegte Regeln haben neue IDs
  const lessonsRef = useRef(lessons);
  lessonsRef.current = lessons;

  // ───────────── Namen ─────────────
  const byId = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
  const S = useMemo(() => byId(subjects), [subjects]);
  const fach = (subjectId: string) => {
    const sub = S.get(subjectId);
    return sub ? fachColorOf(sub) : 'sand';
  };
  const C = useMemo(() => byId(classes), [classes]);
  const G = useMemo(() => byId(groups), [groups]);
  const R = useMemo(() => byId(rooms), [rooms]);
  const T = useMemo(() => byId(teachers), [teachers]);
  const teacherShort = (id: string) => T.get(id)?.lastName ?? '?';
  const targetName = (l: { classId: string | null; groupId: string | null }) =>
    (l.classId ? C.get(l.classId)?.name : l.groupId ? G.get(l.groupId)?.name : '') ?? '?';
  const lessonLabel = (l: LessonRule) => `${S.get(l.subjectId)?.code ?? '?'} ${targetName(l)}`;

  // ───────────── Live-Prüfung ─────────────
  // Harte und weiche Regeln (Kontext mit Tagesbelastung vom Server) und Planungswünsche als Warnung (ADR 0012)
  const conflicts = useMemo(
    () => [
      ...validateTimetable(lessons, context),
      ...checkConstraints(lessons, constraints).map((cf) => ({ ...cf, severity: 'soft' as const })),
    ],
    [lessons, context, constraints],
  );
  const severity = useMemo(() => {
    const m = new Map<string, 'hard' | 'soft'>();
    // Kacheln markieren nur Konflikte einzelner Stunden; Tagesregeln (Hohlstunden …) stehen im Panel
    const perLesson = new Set(['ROOM_CAPACITY', 'WISH_VIOLATED']);
    for (const cf of conflicts)
      if (cf.severity === 'hard' || perLesson.has(cf.code))
        for (const id of cf.lessonIds) if (m.get(id) !== 'hard') m.set(id, cf.severity);
    return m;
  }, [conflicts]);
  const hardCount = conflicts.filter((x) => x.severity === 'hard').length;

  // ───────────── Ansicht ─────────────
  const groupInClass = useCallback(
    (groupId: string, classId: string) => {
      const students = new Set(context.classStudents[classId] ?? []);
      return (context.groupMembers[groupId] ?? []).some((s) => students.has(s));
    },
    [context],
  );
  const inView = useCallback(
    (l: LessonRule) =>
      view.kind === 'class'
        ? l.classId === view.id || (l.groupId !== null && groupInClass(l.groupId, view.id))
        : view.kind === 'teacher'
          ? l.teacherIds.includes(view.id)
          : l.roomId === view.id,
    [view, groupInClass],
  );
  const visible = lessons.filter(inView);
  const pool =
    view.kind === 'room'
      ? []
      : requirements.filter((r) =>
          view.kind === 'class'
            ? r.classId === view.id || (r.groupId !== null && groupInClass(r.groupId, view.id))
            : r.teacherId === view.id,
        );
  const planned = (r: Requirement) =>
    lessons
      .filter(
        (l) =>
          l.subjectId === r.subjectId &&
          l.classId === r.classId &&
          l.groupId === r.groupId &&
          l.teacherIds.includes(r.teacherId),
      )
      .reduce((sum, l) => sum + l.periodCount * (l.weekPattern === 'EVERY' ? 1 : 0.5), 0);

  // ───────────── API und Verlauf ─────────────
  const resolve = (id: string) => {
    let cur = id;
    while (aliases.current.has(cur)) cur = aliases.current.get(cur)!;
    return cur;
  };
  const replaceLesson = (l: EditorLesson) =>
    setLessons((xs) => xs.map((x) => (x.id === l.id ? l : x)));

  async function run(op: Op): Promise<Op> {
    if (op.kind === 'create') {
      const res = await apiRequest<{ lesson: EditorLesson }>(
        'POST',
        `/admin/timetable-versions/${initial.version.id}/lessons`,
        op.fields,
        csrfToken,
      );
      setLessons((xs) => [...xs, res.lesson]);
      if (op.replaces) aliases.current.set(op.replaces, res.lesson.id);
      return { kind: 'delete', id: res.lesson.id };
    }
    const id = resolve(op.id);
    const cur = lessonsRef.current.find((x) => x.id === id);
    if (!cur) throw new Error('Regel nicht gefunden');
    if (op.kind === 'delete') {
      await apiRequest(
        'DELETE',
        `/admin/timetable-versions/${initial.version.id}/lessons/${id}`,
        undefined,
        csrfToken,
      );
      setLessons((xs) => xs.filter((x) => x.id !== id));
      return { kind: 'create', fields: fieldsOf(cur), replaces: id };
    }
    const before = fieldsOf(cur);
    try {
      const res = await apiRequest<{ lesson: EditorLesson }>(
        'PATCH',
        `/admin/timetable-versions/${initial.version.id}/lessons/${id}`,
        { ...op.after, version: cur.version },
        csrfToken,
      );
      replaceLesson(res.lesson);
    } catch (err) {
      if (err instanceof ApiError && err.problem.status === 409 && err.problem.current) {
        replaceLesson(err.problem.current as EditorLesson);
        throw new Error(t('staleUpdated'), { cause: err });
      }
      throw err;
    }
    const inverse: Partial<Fields> = {};
    for (const k of Object.keys(op.after) as (keyof Fields)[])
      (inverse as Record<string, unknown>)[k] = before[k];
    return { kind: 'update', id, after: inverse };
  }

  async function step(op: Op, from: 'new' | 'undo' | 'redo') {
    if (status.state === 'saving') return;
    setStatus({ state: 'saving' });
    try {
      const inverse = await run(op);
      if (from === 'undo') {
        setUndo((s) => s.slice(0, -1));
        setRedo((s) => [...s, inverse]);
      } else if (from === 'redo') {
        setRedo((s) => s.slice(0, -1));
        setUndo((s) => [...s, inverse]);
      } else {
        setUndo((s) => [...s, inverse]);
        setRedo([]);
      }
      setStatus({ state: 'saved' });
    } catch (err) {
      setStatus({
        state: 'error',
        message:
          err instanceof ApiError
            ? err.problem.title
            : err instanceof Error
              ? err.message
              : t('saveError'),
      });
    }
  }
  const perform = (op: Op) => step(op, 'new');
  const undo = () => undoStack.length && step(undoStack[undoStack.length - 1]!, 'undo');
  const redo = () => redoStack.length && step(redoStack[redoStack.length - 1]!, 'redo');

  useEffect(() => {
    if (!editable) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, select, textarea, [role="dialog"]')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) void redo();
        else void undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        void redo();
      } else if (e.key === 'Escape') setSelection(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ───────────── Platzieren ─────────────
  const defaultRoom = (classId: string | null) =>
    classId ? (lessons.find((l) => l.classId === classId && l.roomId)?.roomId ?? null) : null;
  function fromRequirement(r: Requirement, weekday: number, periodStart: number): Fields {
    return {
      subjectId: r.subjectId,
      classId: r.classId,
      groupId: r.groupId,
      roomId: defaultRoom(r.classId),
      weekday,
      periodStart,
      periodCount: r.preferDouble ? 2 : 1,
      weekPattern: 'EVERY',
      teacherIds: [r.teacherId],
    };
  }
  function placeAt(
    weekday: number,
    periodStart: number,
    source: { type: 'lesson' | 'pool'; id: string },
    copy = false,
  ) {
    if (source.type === 'pool') {
      const r = requirements.find((x) => x.id === source.id);
      if (r) void perform({ kind: 'create', fields: fromRequirement(r, weekday, periodStart) });
    } else {
      const l = lessons.find((x) => x.id === source.id);
      if (!l) return;
      if (copy) void perform({ kind: 'create', fields: { ...fieldsOf(l), weekday, periodStart } });
      else if (l.weekday !== weekday || l.periodStart !== periodStart)
        void perform({ kind: 'update', id: l.id, after: { weekday, periodStart } });
    }
    setSelection(null);
  }
  function onCell(weekday: number, periodStart: number) {
    if (!editable) return;
    if (selection) return placeAt(weekday, periodStart, selection);
    const base: Fields = {
      subjectId: subjects[0]?.id ?? '',
      classId: view.kind === 'class' ? view.id : (classes[0]?.id ?? null),
      groupId: null,
      roomId: view.kind === 'room' ? view.id : null,
      weekday,
      periodStart,
      periodCount: 1,
      weekPattern: 'EVERY',
      teacherIds: view.kind === 'teacher' ? [view.id] : [],
    };
    setSheet({ mode: 'new', fields: base });
  }
  const dragData = (e: React.DragEvent) => {
    try {
      return JSON.parse(e.dataTransfer.getData('text/plain')) as {
        type: 'lesson' | 'pool';
        id: string;
      };
    } catch {
      return null;
    }
  };
  const onDrop = (weekday: number, periodStart: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const data = dragData(e);
    if (data) placeAt(weekday, periodStart, data, e.altKey || e.ctrlKey || e.metaKey);
  };
  const allowDrop = (e: React.DragEvent) => {
    if (!editable) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = e.altKey || e.ctrlKey || e.metaKey ? 'copy' : 'move';
  };

  // ───────────── Formular ─────────────
  function readForm(form: HTMLFormElement): Fields {
    const f = new FormData(form);
    const target = String(f.get('target') ?? '');
    return {
      subjectId: String(f.get('subjectId')),
      classId: target.startsWith('c:') ? target.slice(2) : null,
      groupId: target.startsWith('g:') ? target.slice(2) : null,
      roomId: String(f.get('roomId') ?? '') || null,
      teacherIds: f.getAll('teacherIds').map(String),
      weekday: Number(f.get('weekday')),
      periodStart: Number(f.get('periodStart')),
      periodCount: Number(f.get('periodCount')),
      weekPattern: String(f.get('weekPattern')) as WeekPattern,
    };
  }
  async function submitLesson(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fields = readForm(e.currentTarget);
    const current = sheet;
    setSheet(null);
    if (current?.mode === 'new') await perform({ kind: 'create', fields });
    else if (current?.mode === 'edit') {
      const l = lessons.find((x) => x.id === current.id)!;
      const before = fieldsOf(l);
      const after: Partial<Fields> = {};
      for (const k of Object.keys(fields) as (keyof Fields)[]) {
        if (JSON.stringify(fields[k]) !== JSON.stringify(before[k]))
          (after as Record<string, unknown>)[k] = fields[k];
      }
      if (Object.keys(after).length) await perform({ kind: 'update', id: l.id, after });
    }
  }
  async function submitRequirement(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const target = String(f.get('target') ?? '');
    const body = {
      subjectId: String(f.get('subjectId')),
      classId: target.startsWith('c:') ? target.slice(2) : null,
      groupId: target.startsWith('g:') ? target.slice(2) : null,
      teacherId: String(f.get('teacherId')),
      hoursPerWeek: Number(f.get('hoursPerWeek')),
      preferDouble: f.get('preferDouble') === 'on',
    };
    try {
      const res = await apiRequest<{ id: string }>(
        'POST',
        `/admin/timetable-versions/${initial.version.id}/requirements`,
        body,
        csrfToken,
      );
      setRequirements((rs) => [...rs, { id: res.id, ...body }]);
      setSheet(null);
    } catch (err) {
      setStatus({
        state: 'error',
        message: err instanceof ApiError ? err.problem.title : c('error'),
      });
    }
  }
  async function removeRequirement(id: string) {
    await apiRequest(
      'DELETE',
      `/admin/timetable-versions/${initial.version.id}/requirements/${id}`,
      undefined,
      csrfToken,
    ).catch(() => undefined);
    setRequirements((rs) => rs.filter((r) => r.id !== id));
  }
  /** Festpinnen (M7): Der Assistent lässt die Stunde bei einem Lauf unverändert. */
  async function togglePin(id: string, pinned: boolean) {
    const set = (v: boolean) =>
      setLessons((ls) => ls.map((l) => (l.id === id ? { ...l, pinned: v } : l)));
    set(pinned);
    await apiRequest(
      'PATCH',
      `/admin/timetable-versions/${initial.version.id}/lessons/${id}/pin`,
      { pinned },
      csrfToken,
    ).catch(() => set(!pinned));
  }

  async function publish(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const validFrom = String(new FormData(e.currentTarget).get('validFrom'));
    setPublishResult(null);
    try {
      const res = await apiRequest<{ generated: { created: number } }>(
        'POST',
        `/admin/timetable-versions/${initial.version.id}/publish`,
        { validFrom, acceptCoverage },
        csrfToken,
      );
      setPublishResult({ created: res.generated.created });
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError)
        setPublishResult({
          error: err.problem.title,
          conflicts: (err.problem.conflicts as Conflict[] | undefined) ?? undefined,
          coverage: (err.problem.coverage as CoverageRow[] | undefined) ?? undefined,
        });
      else setPublishResult({ error: c('error') });
    }
  }
  async function copyToDraft() {
    const res = await apiRequest<{ id: string }>(
      'POST',
      '/admin/timetable-versions',
      { schoolYearId: initial.version.schoolYear.id, copyFromVersionId: initial.version.id },
      csrfToken,
    );
    router.push(`/admin/stundenplan/${res.id}`);
  }
  async function deleteDraft() {
    await apiRequest(
      'DELETE',
      `/admin/timetable-versions/${initial.version.id}`,
      undefined,
      csrfToken,
    );
    router.push('/admin/stundenplan');
  }

  const resourceName = (cf: Conflict) => {
    const r = cf.resource;
    if (!r) return '';
    if (r.kind === 'teacher')
      return `${T.get(r.id)?.firstName ?? ''} ${T.get(r.id)?.lastName ?? ''}`.trim();
    if (r.kind === 'room') return R.get(r.id)?.name ?? '';
    if (r.kind === 'class') return C.get(r.id)?.name ?? '';
    if (r.kind === 'group') return G.get(r.id)?.name ?? '';
    return '';
  };
  const viewOptions =
    view.kind === 'class'
      ? classes.map((x) => ({ value: x.id, label: x.name }))
      : view.kind === 'teacher'
        ? teachers.map((x) => ({ value: x.id, label: `${x.lastName} ${x.firstName}` }))
        : rooms.map((x) => ({ value: x.id, label: x.name }));
  const targetOptions = [
    ...classes.map((x) => ({ value: `c:${x.id}`, label: `${t('class')} ${x.name}` })),
    ...groups.map((x) => ({ value: `g:${x.id}`, label: `${t('group')} ${x.name}` })),
  ];
  const selectedName = selection
    ? selection.type === 'lesson'
      ? lessonLabel(lessons.find((l) => l.id === selection.id)!)
      : (() => {
          const r = requirements.find((x) => x.id === selection.id);
          return r ? `${S.get(r.subjectId)?.code} ${targetName(r)}` : '';
        })()
    : '';
  const editing = sheet?.mode === 'edit' ? lessons.find((l) => l.id === sheet.id) : undefined;
  const formFields: Fields | undefined =
    sheet?.mode === 'new' ? sheet.fields : editing ? fieldsOf(editing) : undefined;

  // ───────────── Darstellung ─────────────
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/stundenplan" className="text-body-sm text-brand-text underline">
            {t('back')}
          </Link>
          <PageTitle area="stundenplan">
            {initial.version.name ?? initial.version.schoolYear.name}
          </PageTitle>
          <p className="flex flex-wrap items-center gap-2 text-body-sm text-ink-muted">
            <Chip
              tone={
                initial.version.status === 'PUBLISHED'
                  ? 'ok'
                  : initial.version.status === 'DRAFT'
                    ? 'ok'
                    : 'neutral'
              }
            >
              {t(`statuses.${initial.version.status}`)}
            </Chip>
            {t('validFrom')} {initial.version.validFrom}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editable ? (
            <>
              <Button
                variant="ghost"
                onClick={() => void undo()}
                disabled={!undoStack.length || status.state === 'saving'}
                aria-label={t('undo')}
                title={`${t('undo')} (Strg+Z)`}
              >
                <Undo2 aria-hidden="true" size={18} />
              </Button>
              <Button
                variant="ghost"
                onClick={() => void redo()}
                disabled={!redoStack.length || status.state === 'saving'}
                aria-label={t('redo')}
                title={`${t('redo')} (Strg+Y)`}
              >
                <Redo2 aria-hidden="true" size={18} />
              </Button>
            </>
          ) : null}
          <span
            aria-live="polite"
            className={cn(
              'text-body-sm',
              status.state === 'error' ? 'text-danger-ink' : 'text-ink-muted',
            )}
          >
            {status.state === 'saving'
              ? t('saving')
              : status.state === 'saved'
                ? t('saved')
                : status.state === 'error'
                  ? status.message
                  : ''}
          </span>
          {assistant && canEdit ? (
            <Button variant="secondary" asChild iconLeft={Sparkles}>
              <Link href={`/admin/assistent?version=${initial.version.id}`}>{t('assistant')}</Link>
            </Button>
          ) : null}
          {canPublish && initial.version.status === 'DRAFT' ? (
            <Button
              onClick={() => {
                setPublishResult(null);
                setSheet({ mode: 'publish' });
              }}
            >
              {t('publish')}
            </Button>
          ) : null}
          {canEdit && initial.version.status !== 'DRAFT' ? (
            <Button variant="secondary" onClick={() => void copyToDraft()}>
              {t('copyToDraft')}
            </Button>
          ) : null}
          {editable ? (
            <Button
              variant="ghost"
              onClick={() => void deleteDraft()}
              aria-label={t('deleteDraft')}
            >
              <Trash2 aria-hidden="true" size={18} />
            </Button>
          ) : null}
        </div>
      </div>
      {!editable && initial.version.status !== 'DRAFT' ? (
        <p className="rounded-sm border border-line bg-bg-sunken p-3 text-body-sm">
          {t('readOnly')}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[12rem_1fr]">
        <Select
          label={t('view')}
          value={view.kind}
          onChange={(e) => {
            const kind = e.target.value as ViewKind;
            const first =
              kind === 'class'
                ? classes[0]?.id
                : kind === 'teacher'
                  ? teachers[0]?.id
                  : rooms[0]?.id;
            setView({ kind, id: first ?? '' });
          }}
          options={(['class', 'teacher', 'room'] as const).map((k) => ({
            value: k,
            label: t(`views.${k}`),
          }))}
        />
        <Select
          label={t(`views.${view.kind}`)}
          value={view.id}
          onChange={(e) => setView({ kind: view.kind, id: e.target.value })}
          options={viewOptions}
        />
      </div>

      {selection ? (
        <p
          role="status"
          className="flex items-center justify-between gap-2 rounded-sm border border-brand bg-bg-raised p-2 text-body-sm"
        >
          {t('selected', { name: selectedName })}
          <Button variant="ghost" onClick={() => setSelection(null)} aria-label={c('cancel')}>
            <X aria-hidden="true" size={16} />
          </Button>
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[14rem_minmax(0,1fr)] 2xl:grid-cols-[14rem_minmax(0,1fr)_18rem]">
        {/* Pool der noch einzuplanenden Soll-Stunden */}
        <Card className="flex flex-col gap-2 self-start">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-h3">{t('pool')}</h2>
            {editable ? (
              <Button
                variant="ghost"
                onClick={() => setSheet({ mode: 'requirement' })}
                aria-label={t('addRequirement')}
              >
                <Plus aria-hidden="true" size={18} />
              </Button>
            ) : null}
          </div>
          {editable ? <p className="text-caption text-ink-muted">{t('poolHelp')}</p> : null}
          {pool.length === 0 ? (
            <p className="text-body-sm text-ink-muted">{t('poolEmpty')}</p>
          ) : null}
          <ul className="flex flex-col gap-2">
            {pool.map((r) => {
              const done = planned(r);
              const complete = done >= r.hoursPerWeek;
              const active = selection?.type === 'pool' && selection.id === r.id;
              return (
                <li key={r.id} className="flex items-stretch gap-1">
                  <button
                    type="button"
                    disabled={!editable}
                    draggable={editable}
                    onDragStart={(e) =>
                      e.dataTransfer.setData(
                        'text/plain',
                        JSON.stringify({ type: 'pool', id: r.id }),
                      )
                    }
                    onClick={() => setSelection(active ? null : { type: 'pool', id: r.id })}
                    aria-pressed={active}
                    className={cn(
                      'pf-tt__cell min-h-(--tap-min) flex-1 items-start text-left',
                      `is-${fach(r.subjectId)}`,
                      active && 'is-drag',
                      complete && 'opacity-60',
                    )}
                  >
                    <span>
                      {S.get(r.subjectId)?.name} · {targetName(r)}
                    </span>
                    <small>
                      {teacherShort(r.teacherId)} · {t('progress', { done, total: r.hoursPerWeek })}
                    </small>
                  </button>
                  {editable ? (
                    <Button
                      variant="ghost"
                      onClick={() => void removeRequirement(r.id)}
                      aria-label={c('delete')}
                    >
                      <X aria-hidden="true" size={14} />
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Card>

        {/* Raster */}
        <div className="overflow-x-auto">
          <div
            className="pf-tt min-w-160"
            style={{
              gridTemplateColumns: 'var(--space-12) repeat(5, minmax(0, 1fr))',
              gridTemplateRows: `auto repeat(${periods.length}, minmax(var(--space-16), auto))`,
            }}
          >
            <div />
            {DAYS.map((wd) => (
              <div key={wd} className="pf-tt__head" style={{ gridColumn: wd + 1, gridRow: 1 }}>
                {d(`short${wd}`)}
              </div>
            ))}
            {periods.map((p, i) => (
              <div
                key={p.number}
                className={cn(
                  'pf-tt__slot flex-col',
                  p.blocksDouble && 'border-b-2 border-dashed border-line',
                )}
                style={{ gridColumn: 1, gridRow: i + 2 }}
              >
                <span className="text-ink">{p.number}</span>
                <span>{p.startTime}</span>
              </div>
            ))}
            {DAYS.flatMap((wd) =>
              periods.map((p, i) => (
                <button
                  key={`cell-${wd}-${p.number}`}
                  type="button"
                  disabled={!editable}
                  onClick={() => onCell(wd, p.number)}
                  onDragOver={allowDrop}
                  onDrop={onDrop(wd, p.number)}
                  aria-label={`${d(String(wd))}, ${p.number}. ${t('period')}${selection ? ` – ${selection.type === 'pool' ? t('placeHere') : t('moveHere')}` : ''}`}
                  className={cn(
                    'pf-tt__cell pf-tt__cell--empty',
                    selection && 'bg-brand-soft hover:ring-2 hover:ring-brand',
                    editable && 'cursor-pointer',
                  )}
                  style={{ gridColumn: wd + 1, gridRow: i + 2 }}
                />
              )),
            )}
            {DAYS.flatMap((wd) =>
              periods.map((p, i) => {
                const here = visible.filter((l) => l.weekday === wd && l.periodStart === p.number);
                if (here.length === 0) return null;
                const span = Math.max(...here.map((l) => l.periodCount));
                return (
                  <div
                    key={`l-${wd}-${p.number}`}
                    className="z-10 flex gap-1"
                    style={{
                      gridColumn: wd + 1,
                      gridRow: `${i + 2} / span ${Math.min(span, periods.length - i)}`,
                    }}
                    onDragOver={allowDrop}
                    onDrop={onDrop(wd, p.number)}
                  >
                    {here.map((l) => {
                      const sev = severity.get(l.id);
                      const selected = selection?.type === 'lesson' && selection.id === l.id;
                      const other =
                        view.kind === 'teacher'
                          ? targetName(l)
                          : l.teacherIds.map(teacherShort).join(', ');
                      return (
                        <button
                          key={l.id}
                          type="button"
                          draggable={editable}
                          onDragStart={(e) =>
                            e.dataTransfer.setData(
                              'text/plain',
                              JSON.stringify({ type: 'lesson', id: l.id }),
                            )
                          }
                          onClick={() =>
                            editable ? setSheet({ mode: 'edit', id: l.id }) : undefined
                          }
                          aria-label={`${S.get(l.subjectId)?.name}, ${targetName(l)}, ${other}${sev === 'hard' ? `, ${t('conflicts')}` : ''}`}
                          className={cn(
                            'pf-tt__cell min-w-0 flex-1 overflow-hidden',
                            sev === 'hard'
                              ? 'is-conflict'
                              : sev === 'soft'
                                ? 'is-subst'
                                : `is-${fach(l.subjectId)}`,
                            selected && 'is-drag',
                          )}
                        >
                          {sev === 'hard' ? <TriangleAlert aria-hidden="true" /> : null}
                          <span>
                            {l.pinned ? (
                              <Pin aria-label={t('pinned')} className="mr-0.5 inline size-3" />
                            ) : null}
                            {S.get(l.subjectId)?.code}
                            {l.weekPattern !== 'EVERY' ? ` (${l.weekPattern})` : ''}
                          </span>
                          <small className="max-w-full truncate">{other}</small>
                          {view.kind !== 'room' ? (
                            <small className="max-w-full truncate">
                              {l.roomId ? R.get(l.roomId)?.name : t('noRoom')}
                            </small>
                          ) : null}
                          {sev === 'hard' ? <small className="font-text">{t('hard')}</small> : null}
                        </button>
                      );
                    })}
                  </div>
                );
              }),
            )}
          </div>
        </div>

        {/* Konfliktpanel */}
        <Card
          className="flex flex-col gap-2 self-start lg:col-span-2 2xl:col-span-1"
          aria-live="polite"
        >
          <h2 className="text-h3">{t('conflicts')}</h2>
          {conflicts.length === 0 ? (
            <p className="flex items-center gap-2 text-body-sm text-brand-text">
              <Check aria-hidden="true" className="size-4" />
              {t('noConflicts')}
            </p>
          ) : (
            <p className="text-body-sm">
              <span className="text-danger-ink">{t('hardCount', { n: hardCount })}</span> ·{' '}
              {t('softCount', { n: conflicts.length - hardCount })}
            </p>
          )}
          <ul className="flex max-h-[32rem] flex-col gap-2 overflow-y-auto">
            {[...conflicts]
              .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'hard' ? -1 : 1))
              .map((cf, i) => (
                <li
                  key={i}
                  className={cn(
                    'rounded-md p-3 text-body-sm',
                    cf.severity === 'hard' ? 'bg-danger-soft' : 'bg-signal-soft',
                  )}
                >
                  <p>
                    <Chip tone={cf.severity === 'hard' ? 'danger' : 'late'}>{t(cf.severity)}</Chip>{' '}
                    {cf.message}
                  </p>
                  {resourceName(cf) ? (
                    <p className="text-caption text-ink-muted">{resourceName(cf)}</p>
                  ) : null}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {cf.lessonIds.map((id) => {
                      const l = lessons.find((x) => x.id === id);
                      if (!l) return null;
                      return (
                        <button
                          key={id}
                          type="button"
                          className="min-h-8 rounded-sm border border-line px-2 text-caption hover:bg-bg-sunken"
                          onClick={() => {
                            if (l.classId) setView({ kind: 'class', id: l.classId });
                            else if (l.teacherIds[0])
                              setView({ kind: 'teacher', id: l.teacherIds[0] });
                            if (editable) setSheet({ mode: 'edit', id });
                          }}
                        >
                          {lessonLabel(l)}
                        </button>
                      );
                    })}
                  </div>
                </li>
              ))}
          </ul>
        </Card>
      </div>

      {/* Stunde anlegen oder bearbeiten */}
      <Sheet
        open={sheet?.mode === 'new' || sheet?.mode === 'edit'}
        onOpenChange={(o) => !o && setSheet(null)}
        title={sheet?.mode === 'edit' ? t('editLesson') : t('newLesson')}
        closeLabel={c('close')}
      >
        {formFields ? (
          <form
            key={sheet?.mode === 'edit' ? sheet.id : 'new'}
            onSubmit={submitLesson}
            className="flex flex-col gap-3"
            noValidate
          >
            <Select
              label={t('subject')}
              name="subjectId"
              defaultValue={formFields.subjectId}
              options={subjects.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))}
            />
            <Select
              label={t('classOrGroup')}
              name="target"
              defaultValue={
                formFields.classId
                  ? `c:${formFields.classId}`
                  : formFields.groupId
                    ? `g:${formFields.groupId}`
                    : ''
              }
              options={targetOptions}
            />
            <div className="flex flex-col gap-1">
              <label htmlFor="teacherIds" className="text-label">
                {t('teachers')}
              </label>
              <select
                id="teacherIds"
                name="teacherIds"
                multiple
                size={5}
                defaultValue={formFields.teacherIds}
                className="rounded-sm border border-line bg-bg-sunken p-1 text-ink"
              >
                {teachers.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.lastName} {x.firstName}
                  </option>
                ))}
              </select>
            </div>
            <Select
              label={t('room')}
              name="roomId"
              defaultValue={formFields.roomId ?? ''}
              emptyLabel={t('noRoom')}
              options={rooms.map((r) => ({
                value: r.id,
                label: r.capacity ? `${r.name} (${r.capacity})` : r.name,
              }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <Select
                label={t('weekday')}
                name="weekday"
                defaultValue={String(formFields.weekday)}
                options={DAYS.map((x) => ({ value: String(x), label: d(String(x)) }))}
              />
              <Select
                label={t('period')}
                name="periodStart"
                defaultValue={String(formFields.periodStart)}
                options={periods.map((p) => ({
                  value: String(p.number),
                  label: `${p.number}. (${p.startTime})`,
                }))}
              />
              <Select
                label={t('duration')}
                name="periodCount"
                defaultValue={String(formFields.periodCount)}
                options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) }))}
              />
              <Select
                label={t('pattern')}
                name="weekPattern"
                defaultValue={formFields.weekPattern}
                options={(['EVERY', 'A', 'B'] as const).map((x) => ({
                  value: x,
                  label: t(`patterns.${x}`),
                }))}
              />
            </div>
            {editing ? (
              <Switch
                checked={!!editing.pinned}
                label={t('pinLabel')}
                onCheckedChange={(v) => void togglePin(editing.id, v)}
              />
            ) : null}
            <div className="flex flex-wrap justify-between gap-2">
              {editing ? (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => {
                      setSheet(null);
                      void perform({ kind: 'delete', id: editing.id });
                    }}
                  >
                    {t('deleteLesson')}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setSheet(null);
                      setSelection({ type: 'lesson', id: editing.id });
                    }}
                  >
                    {t('move')}
                  </Button>
                </div>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={() => setSheet(null)}>
                  {c('cancel')}
                </Button>
                <Button type="submit">{c('save')}</Button>
              </div>
            </div>
          </form>
        ) : null}
      </Sheet>

      {/* Soll-Stunde */}
      <Sheet
        open={sheet?.mode === 'requirement'}
        onOpenChange={(o) => !o && setSheet(null)}
        title={t('addRequirement')}
        closeLabel={c('close')}
      >
        <form onSubmit={submitRequirement} className="flex flex-col gap-3" noValidate>
          <Select
            label={t('subject')}
            name="subjectId"
            options={subjects.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))}
          />
          <Select
            label={t('classOrGroup')}
            name="target"
            defaultValue={view.kind === 'class' ? `c:${view.id}` : undefined}
            options={targetOptions}
          />
          <Select
            label={t('teachers')}
            name="teacherId"
            defaultValue={view.kind === 'teacher' ? view.id : undefined}
            options={teachers.map((x) => ({ value: x.id, label: `${x.lastName} ${x.firstName}` }))}
          />
          <Input
            label={t('hoursPerWeek')}
            name="hoursPerWeek"
            type="number"
            min={1}
            max={20}
            defaultValue="2"
          />
          <Checkbox label={t('preferDouble')} name="preferDouble" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setSheet(null)}>
              {c('cancel')}
            </Button>
            <Button type="submit">{c('create')}</Button>
          </div>
        </form>
      </Sheet>

      {/* Veröffentlichen */}
      <Sheet
        open={sheet?.mode === 'publish'}
        onOpenChange={(o) => !o && setSheet(null)}
        title={t('publishTitle')}
        description={t('publishHelp')}
        closeLabel={c('close')}
      >
        {publishResult?.created !== undefined ? (
          <div className="flex flex-col gap-3">
            <p role="status">{t('published', { created: publishResult.created })}</p>
            <Button onClick={() => setSheet(null)}>{c('close')}</Button>
          </div>
        ) : (
          <form onSubmit={publish} className="flex flex-col gap-3" noValidate>
            <Input
              label={t('validFrom')}
              name="validFrom"
              type="date"
              min={today}
              max={initial.version.schoolYear.endsOn}
              defaultValue={initial.version.validFrom > today ? initial.version.validFrom : today}
              required
            />
            {hardCount > 0 ? (
              <Banner tone="danger" icon={TriangleAlert}>
                {t('publishBlocked')} ({t('hardCount', { n: hardCount })})
              </Banner>
            ) : null}
            {publishResult?.error ? (
              <Banner tone="danger" icon={TriangleAlert} role="alert">
                <p>{publishResult.error}</p>
                {publishResult.conflicts?.length ? (
                  <ul className="list-disc pl-5 text-body-sm">
                    {publishResult.conflicts.map((cf, i) => (
                      <li key={i}>{cf.message}</li>
                    ))}
                  </ul>
                ) : null}
                {publishResult.coverage?.length ? (
                  <ul className="list-disc pl-5 text-body-sm">
                    {publishResult.coverage.map((cv) => {
                      const r = requirements.find((x) => x.id === cv.requirementId);
                      return (
                        <li key={cv.requirementId}>
                          {r ? `${S.get(r.subjectId)?.name ?? '?'} ${targetName(r)}: ` : ''}
                          {t('coverageRow', { planned: cv.planned, required: cv.required })}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </Banner>
            ) : null}
            {publishResult?.coverage?.length ? (
              <Checkbox
                label={t('acceptCoverage')}
                checked={acceptCoverage}
                onChange={(e) => setAcceptCoverage(e.target.checked)}
              />
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setSheet(null)}>
                {c('cancel')}
              </Button>
              <Button type="submit" disabled={hardCount > 0}>
                {t('publish')}
              </Button>
            </div>
          </form>
        )}
      </Sheet>
    </div>
  );
}
