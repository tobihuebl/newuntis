'use client';
import { Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Button,
  Card,
  Checkbox,
  Chip,
  EmptyState,
  Input,
  Select,
  Sheet,
  type SelectOption,
} from '@sp/ui';
import { ApiError, apiRequest } from '../../lib/api-client';
import { useT } from '../../lib/i18n';
import { PageTitle } from '../page-title';
import { FormError } from '../form-bits';

export type FieldType = 'text' | 'number' | 'date' | 'time' | 'checkbox' | 'select';

export interface Field {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: SelectOption[];
  /** Nur beim Anlegen änderbar bzw. sichtbar. */
  createOnly?: boolean;
  emptyLabel?: string;
  placeholder?: string;
  hint?: string;
}

export interface Column<Row> {
  key: string;
  label: string;
  render: (row: Row) => React.ReactNode;
}

export interface CrudManagerProps<Row extends { id: string }> {
  /** Pfad unter /admin, z. B. "subjects". */
  resource: string;
  rows: Row[];
  columns: Column<Row>[];
  fields: Field[];
  /** Wert eines Feldes für die Bearbeitung. */
  toForm: (row: Row) => Record<string, string | boolean>;
  /** Zusätzliche feste Werte, die beim Anlegen mitgesendet werden (z. B. schoolYearId). */
  createExtra?: Record<string, unknown>;
  title: string;
  newLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  csrfToken: string;
  readOnly?: boolean;
  /** Zweite Liste auf derselben Seite (z. B. Gruppen unter Klassen): Überschrift h2, Anlegen sekundär. */
  secondary?: boolean;
  /** Bearbeiten ausblenden (Ressourcen ohne PATCH, z. B. Ferien). */
  canEdit?: boolean;
  /** Link zur Detailseite einer Zeile. */
  detailHref?: (row: Row) => string;
  /** Platz für weitere Aktionen in der Kopfzeile. */
  headerExtra?: React.ReactNode;
}

/** Ab so vielen Zeilen gibt es ein Suchfeld (Design System: Tabelle mit Filter). */
const FILTER_FROM = 8;

function convert(field: Field, raw: string | boolean | undefined): unknown {
  if (field.type === 'checkbox') return raw === true;
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (s === '') return field.required ? '' : null;
  return field.type === 'number' ? Number(s) : s;
}

/** Liste mit Anlegen, Bearbeiten und Löschen für einfache Stammdaten (Fächer, Räume, Raster, Klassen ...). */
export function CrudManager<Row extends { id: string }>(props: CrudManagerProps<Row>) {
  const {
    resource,
    rows,
    columns,
    fields,
    toForm,
    createExtra,
    readOnly = false,
    canEdit = true,
    csrfToken,
    detailHref,
  } = props;
  const t = useT('common');
  const router = useRouter();
  const [editing, setEditing] = useState<{ row: Row | null } | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  function fail(err: unknown) {
    if (err instanceof ApiError) {
      const p = err.problem;
      if (p.status === 409) setError(`${t('conflict')} (${p.title})`);
      else if (p.status === 403) setError(t('forbidden'));
      else setError(p.title);
      setFieldErrors(Object.fromEntries((p.errors ?? []).map((e) => [e.field, e.message])));
    } else setError(t('error'));
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {};
    for (const f of fields) {
      if (f.createOnly && editing?.row) continue;
      body[f.name] = convert(
        f,
        f.type === 'checkbox'
          ? form.get(f.name) === 'on'
          : ((form.get(f.name) as string | null) ?? ''),
      );
    }
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      if (editing?.row)
        await apiRequest('PATCH', `/admin/${resource}/${editing.row.id}`, body, csrfToken);
      else await apiRequest('POST', `/admin/${resource}`, { ...createExtra, ...body }, csrfToken);
      setEditing(null);
      router.refresh();
    } catch (err) {
      fail(err);
    }
    setBusy(false);
  }

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest('DELETE', `/admin/${resource}/${deleting.id}`, undefined, csrfToken);
      setDeleting(null);
      router.refresh();
    } catch (err) {
      fail(err);
    }
    setBusy(false);
  }

  const values = editing?.row ? toForm(editing.row) : {};
  const [query, setQuery] = useState('');
  const needle = query.trim().toLocaleLowerCase('de');
  const shown = needle
    ? rows.filter((row) =>
        Object.values(toForm(row)).some(
          (v) => typeof v === 'string' && v.toLocaleLowerCase('de').includes(needle),
        ),
      )
    : rows;

  const actions = (row: Row) => (
    <div className="flex shrink-0 justify-end">
      {canEdit ? (
        <Button
          variant="ghost"
          size="sm"
          aria-label={t('edit')}
          onClick={() => {
            setError(null);
            setFieldErrors({});
            setEditing({ row });
          }}
        >
          <Pencil aria-hidden="true" />
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        aria-label={t('delete')}
        onClick={() => {
          setError(null);
          setDeleting(row);
        }}
      >
        <Trash2 aria-hidden="true" />
      </Button>
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pt-4 pb-8 lg:px-6 lg:pt-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        {props.secondary ? (
          <h2 className="text-h2">{props.title}</h2>
        ) : (
          <PageTitle area="stammdaten">{props.title}</PageTitle>
        )}
        <div className="flex flex-wrap gap-2">
          {props.headerExtra}
          {readOnly ? (
            <Chip tone="absent" icon={Eye} className="self-center">
              {t('readOnly')}
            </Chip>
          ) : (
            <Button
              iconLeft={Plus}
              variant={props.secondary ? 'secondary' : 'primary'}
              onClick={() => {
                setError(null);
                setFieldErrors({});
                setEditing({ row: null });
              }}
            >
              {props.newLabel}
            </Button>
          )}
        </div>
      </div>

      {rows.length > FILTER_FROM ? (
        <Input
          label={t('search')}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-sm"
        />
      ) : null}

      {rows.length === 0 ? (
        <Card flat>
          <EmptyState title={props.emptyTitle} description={props.emptyDescription} />
        </Card>
      ) : shown.length === 0 ? (
        <Card flat>
          <EmptyState title={t('noMatch')} />
        </Card>
      ) : (
        <Card className="p-0">
          {/* Mobil: Karten-Liste mit zwei Feldern (Design System, Responsive Muster) */}
          <ul className="md:hidden">
            {shown.map((row) => (
              <li
                key={row.id}
                className="flex min-h-14 items-center gap-2 border-b border-line py-2 pr-2 pl-4 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-body-strong">
                    {detailHref ? (
                      <Link
                        className="pf-focusable text-brand-text underline underline-offset-4"
                        href={detailHref(row)}
                      >
                        {columns[0]?.render(row)}
                      </Link>
                    ) : (
                      columns[0]?.render(row)
                    )}
                  </div>
                  {columns[1] ? (
                    <div className="truncate text-body-sm text-ink-muted">
                      {columns[1].label}: {columns[1].render(row)}
                    </div>
                  ) : null}
                </div>
                {readOnly ? null : actions(row)}
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-body-sm">
              <thead className="border-b border-line text-label text-ink-muted">
                <tr>
                  {columns.map((c) => (
                    <th key={c.key} scope="col" className="px-4 py-3">
                      {c.label}
                    </th>
                  ))}
                  {readOnly ? null : (
                    <th scope="col" className="w-28 px-4 py-3">
                      <span className="sr-only">{t('edit')}</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr key={row.id} className="border-b border-line last:border-b-0">
                    {columns.map((c, i) => (
                      <td key={c.key} className="px-4 py-3">
                        {i === 0 && detailHref ? (
                          <Link
                            className="pf-focusable text-label text-brand-text underline underline-offset-4"
                            href={detailHref(row)}
                          >
                            {c.render(row)}
                          </Link>
                        ) : (
                          c.render(row)
                        )}
                      </td>
                    ))}
                    {readOnly ? null : <td className="px-2 py-1">{actions(row)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Sheet
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing?.row ? t('edit') : props.newLabel}
        closeLabel={t('close')}
      >
        {editing ? (
          <form
            key={editing.row?.id ?? 'new'}
            onSubmit={submit}
            className="flex flex-col gap-4"
            noValidate
          >
            {fields
              .filter((f) => !(f.createOnly && editing.row))
              .map((f) => {
                const value = values[f.name];
                if (f.type === 'checkbox')
                  return (
                    <Checkbox
                      key={f.name}
                      name={f.name}
                      label={f.label}
                      defaultChecked={value === true}
                    />
                  );
                if (f.type === 'select') {
                  return (
                    <Select
                      key={f.name}
                      name={f.name}
                      label={f.label}
                      options={f.options ?? []}
                      emptyLabel={f.emptyLabel}
                      defaultValue={typeof value === 'string' ? value : ''}
                      error={fieldErrors[f.name]}
                    />
                  );
                }
                return (
                  <Input
                    key={f.name}
                    name={f.name}
                    label={f.label}
                    type={
                      f.type === 'number'
                        ? 'number'
                        : f.type === 'date'
                          ? 'date'
                          : f.type === 'time'
                            ? 'time'
                            : 'text'
                    }
                    required={f.required}
                    placeholder={f.placeholder}
                    hint={f.hint}
                    defaultValue={typeof value === 'string' ? value : ''}
                    error={fieldErrors[f.name]}
                  />
                );
              })}
            {error ? <FormError message={error} /> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                {t('cancel')}
              </Button>
              <Button type="submit" loading={busy}>
                {t('save')}
              </Button>
            </div>
          </form>
        ) : null}
      </Sheet>

      <Sheet
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t('confirmDelete')}
        closeLabel={t('close')}
      >
        {error ? <FormError message={error} /> : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleting(null)}>
            {t('cancel')}
          </Button>
          <Button variant="danger" onClick={remove} loading={busy}>
            {t('delete')}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
