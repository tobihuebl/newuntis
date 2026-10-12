'use client';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Send, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { ClassAudience, MessageClassOption, Recipient, ThreadCreateInput } from '@sp/shared';
import { Chip, Button, Card, Input, SegmentedControl, Select, Skeleton, Textarea } from '@sp/ui';
import { apiRequest } from '../../lib/api-client';
import { useApi, useProblemText } from '../../lib/use-api';
import { useSession } from '../providers';

type Mode = 'persons' | 'class';

/** Neue Nachricht: an einzelne Personen (ein gemeinsames Gespräch) oder an eine Klasse (je Familie eines). */
export function ComposeScreen() {
  const t = useTranslations('messages');
  const problem = useProblemText();
  const { csrfToken } = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const search = useSearchParams();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const h = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(h);
  }, [query]);
  const options = useApi<{ data: Recipient[]; classes: MessageClassOption[] }>(
    ['recipients', debounced],
    `/threads/recipients${debounced ? `?q=${encodeURIComponent(debounced)}` : ''}`,
  );
  const [mode, setMode] = useState<Mode>(search.get('klasse') ? 'class' : 'persons');
  const [selected, setSelected] = useState<Recipient[]>([]);
  const [classId, setClassId] = useState(search.get('klasse') ?? '');
  const [audience, setAudience] = useState<ClassAudience>(
    search.get('zielgruppe') === 'schueler' ? 'students' : 'guardians',
  );
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const classes = options.data?.classes ?? [];
  const chosenClass = classId || classes[0]?.id || '';

  const kindLabel = (r: Recipient) =>
    r.kind === 'staff'
      ? t('kindStaff')
      : r.kind === 'student'
        ? t('kindStudent')
        : t('kindGuardian');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === 'persons' && selected.length === 0) return setError(t('pickRecipients'));
    const to: ThreadCreateInput['to'] =
      mode === 'persons'
        ? { kind: 'persons', personIds: selected.map((r) => r.id) }
        : { kind: 'class', classId: chosenClass, audience };
    setBusy(true);
    try {
      const r = await apiRequest<{ threadIds: string[]; skipped: number }>(
        'POST',
        '/threads',
        { subject, body, to },
        csrfToken,
      );
      await qc.invalidateQueries({ queryKey: ['threads'] });
      if (r.threadIds.length === 1) router.push(`/nachrichten/${r.threadIds[0]}`);
      else router.push(`/nachrichten?gesendet=${r.threadIds.length}&ohne=${r.skipped}`);
    } catch (err) {
      setError(problem(err));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <Button variant="ghost" asChild className="self-start">
        <Link href="/nachrichten">
          <ArrowLeft aria-hidden="true" size={18} />
          {t('back')}
        </Link>
      </Button>
      <h1 className="text-h1">{t('new')}</h1>
      {!options.data && options.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
          {classes.length > 0 ? (
            <SegmentedControl
              label={t('to')}
              value={mode}
              onChange={setMode}
              options={[
                { value: 'persons', label: t('toPersons') },
                { value: 'class', label: t('toClass') },
              ]}
            />
          ) : null}

          {mode === 'persons' ? (
            <div className="flex flex-col gap-2">
              {selected.length > 0 ? (
                <ul className="flex flex-wrap gap-2" aria-label={t('selected')}>
                  {selected.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(selected.filter((x) => x.id !== r.id))}
                        className="inline-flex min-h-11 items-center gap-1 rounded-full border border-line bg-bg-sunken px-3 text-body-sm hover:border-danger"
                      >
                        {r.name}
                        <X aria-hidden="true" size={14} />
                        <span className="sr-only">{t('remove')}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <Input
                label={t('search')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
                type="search"
              />
              <Card className="max-h-72 overflow-y-auto p-0">
                {(options.data?.data ?? []).length === 0 ? (
                  <p className="p-4 text-body-sm text-ink-muted">{t('noRecipients')}</p>
                ) : (
                  <ul>
                    {options.data!.data.map((r) => {
                      const on = selected.some((x) => x.id === r.id);
                      return (
                        <li key={r.id} className="border-b border-line last:border-b-0">
                          <label className="flex min-h-12 cursor-pointer items-center gap-3 px-4 py-2 hover:bg-bg-sunken">
                            <input
                              type="checkbox"
                              className="size-5 accent-brand"
                              checked={on}
                              onChange={() =>
                                setSelected(
                                  on ? selected.filter((x) => x.id !== r.id) : [...selected, r],
                                )
                              }
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate">{r.name}</span>
                              {r.context ? (
                                <span className="block truncate text-body-sm text-ink-muted">
                                  {r.context}
                                </span>
                              ) : null}
                            </span>
                            <Chip>{kindLabel(r)}</Chip>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
              {selected.length > 1 ? <p className="text-body-sm text-ink-muted">{t('groupHint')}</p> : null}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <Select
                label={t('class')}
                value={chosenClass}
                onChange={(e) => setClassId(e.target.value)}
                options={classes.map((c) => ({ value: c.id, label: c.name }))}
              />
              <SegmentedControl
                label={t('audience')}
                value={audience}
                onChange={setAudience}
                options={[
                  { value: 'guardians', label: t('audienceGuardians') },
                  { value: 'students', label: t('audienceStudents') },
                ]}
              />
              <p className="text-body-sm text-ink-muted">{t('classHint')}</p>
            </div>
          )}

          <Input
            label={t('subject')}
            value={subject}
            maxLength={200}
            required
            onChange={(e) => setSubject(e.target.value)}
          />
          <Textarea
            label={t('body')}
            value={body}
            maxLength={5000}
            required
            rows={6}
            onChange={(e) => setBody(e.target.value)}
          />
          {error ? (
            <p role="alert" className="text-body-sm text-danger-ink">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            disabled={busy || !subject.trim() || !body.trim()}
            className="self-start"
          >
            <Send aria-hidden="true" size={18} />
            {t('send')}
          </Button>
        </form>
      )}
    </div>
  );
}
