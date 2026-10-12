'use client';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Checkbox, EmptyState, Input, Select, Sheet, type SelectOption } from '@sp/ui';
import { ApiError, apiRequest } from '../../lib/api-client';
import { useT } from '../../lib/i18n';

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
  /** Bearbeiten ausblenden (Ressourcen ohne PATCH, z. B. Ferien). */
  canEdit?: boolean;
  /** Link zur Detailseite einer Zeile. */
  detailHref?: (row: Row) => string;
  /** Platz für weitere Aktionen in der Kopfzeile. */
  headerExtra?: React.ReactNode;
}

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

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-h1">{props.title}</h1>
        <div className="flex flex-wrap gap-2">
          {props.headerExtra}
          {readOnly ? (
            <span className="self-center text-body-sm text-ink-muted">{t('readOnly')}</span>
          ) : (
            <Button
              onClick={() => {
                setError(null);
                setFieldErrors({});
                setEditing({ row: null });
              }}
            >
              <Plus aria-hidden="true" size={18} />
              {props.newLabel}
            </Button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-md border border-line bg-bg-raised">
          <EmptyState title={props.emptyTitle} description={props.emptyDescription} />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-line bg-bg-raised">
          <table className="w-full text-left text-body-sm">
            <thead className="border-b border-line text-ink-muted">
              <tr>
                {columns.map((c) => (
                  <th key={c.key} scope="col" className="px-4 py-3 font-medium">
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
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-line last:border-b-0">
                  {columns.map((c, i) => (
                    <td key={c.key} className="px-4 py-3">
                      {i === 0 && detailHref ? (
                        <a className="text-brand-text underline" href={detailHref(row)}>
                          {c.render(row)}
                        </a>
                      ) : (
                        c.render(row)
                      )}
                    </td>
                  ))}
                  {readOnly ? null : (
                    <td className="px-2 py-1">
                      <div className="flex justify-end">
                        {canEdit ? (
                          <Button
                            variant="ghost"
                            aria-label={t('edit')}
                            onClick={() => {
                              setError(null);
                              setFieldErrors({});
                              setEditing({ row });
                            }}
                          >
                            <Pencil aria-hidden="true" size={18} />
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          aria-label={t('delete')}
                          onClick={() => {
                            setError(null);
                            setDeleting(row);
                          }}
                        >
                          <Trash2 aria-hidden="true" size={18} />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
                    defaultValue={typeof value === 'string' ? value : ''}
                    error={fieldErrors[f.name]}
                  />
                );
              })}
            {error ? (
              <p role="alert" className="text-body-sm text-danger-ink">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={busy}>
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
        {error ? (
          <p role="alert" className="text-body-sm text-danger-ink">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleting(null)}>
            {t('cancel')}
          </Button>
          <Button variant="danger" onClick={remove} disabled={busy}>
            {t('delete')}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
