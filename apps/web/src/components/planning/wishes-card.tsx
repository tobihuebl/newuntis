'use client';
import { Languages, Sparkles, Trash2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import type { PlanningConstraintItem, TranslateResponse } from '@sp/shared';
import {
  Banner,
  Button,
  Card,
  CardTitle,
  Checkbox,
  Chip,
  EmptyState,
  Skeleton,
  Switch,
  Textarea,
  useToast,
} from '@sp/ui';
import { useApi, useApiMutation, useProblemText } from '../../lib/use-api';
import { useT } from '../../lib/i18n';
import { FormError } from '../form-bits';
import { LoadError } from '../load-error';

/**
 * Planungswünsche (M7): Liste mit An/Aus, hart oder weich und Löschen. Neue Wünsche in Worten: Übersetzen liefert
 * Vorschläge, die erst nach Bestätigung gespeichert werden; Unverstandenes bleibt sichtbar.
 */
export function WishesCard({ schoolYearId, ai }: { schoolYearId: string; ai: boolean }) {
  const t = useT('assistant');
  const problem = useProblemText();
  const toast = useToast();
  const key = ['planning', 'constraints', schoolYearId];
  const list = useApi<{ data: PlanningConstraintItem[] }>(
    key,
    `/admin/planning/constraints?schoolYearId=${schoolYearId}`,
  );
  const translate = useApiMutation<{ schoolYearId: string; text: string }, TranslateResponse>(
    'POST',
    () => '/admin/planning/translate',
  );
  const save = useApiMutation<{ schoolYearId: string; constraints: unknown[] }>(
    'POST',
    () => '/admin/planning/constraints',
    [key],
  );
  const patch = useApiMutation<{ id: string; active?: boolean; hard?: boolean }>(
    'PATCH',
    (b) => `/admin/planning/constraints/${b.id}`,
    [key],
  );
  const remove = useApiMutation<string>('DELETE', (id) => `/admin/planning/constraints/${id}`, [
    key,
  ]);
  const [text, setText] = useState('');
  const [result, setResult] = useState<TranslateResponse | null>(null);
  const [chosen, setChosen] = useState<Set<number>>(new Set());

  async function onTranslate(e: React.FormEvent) {
    e.preventDefault();
    const r = await translate.mutateAsync({ schoolYearId, text });
    setResult(r);
    setChosen(new Set(r.proposals.map((_, i) => i)));
  }
  async function onSave() {
    if (!result) return;
    const constraints = result.proposals.filter((_, i) => chosen.has(i)).map((p) => p.constraint);
    if (constraints.length === 0) return;
    await save.mutateAsync({ schoolYearId, constraints });
    toast({ text: t('wishesSaved', { count: constraints.length }) });
    setResult(null);
    setText('');
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <CardTitle as="h2">{t('wishes')}</CardTitle>
        <p className="text-body-sm text-ink-muted">{t('wishesHelp')}</p>
      </div>

      {list.isError ? (
        <LoadError error={list.error} onRetry={() => void list.refetch()} />
      ) : !list.data ? (
        <Skeleton className="h-24 w-full rounded-lg" />
      ) : list.data.data.length === 0 ? (
        <EmptyState as="h3" title={t('noWishes')} />
      ) : (
        <ul className="flex flex-col divide-y divide-line" aria-label={t('wishes')}>
          {list.data.data.map((w) => (
            <li key={w.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
              <p
                className={w.active ? 'text-body-strong' : 'text-body text-ink-muted line-through'}
              >
                {w.summary}
              </p>
              {w.text ? <p className="text-caption text-ink-muted">„{w.text}“</p> : null}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <Chip tone={w.hard ? 'ok' : 'absent'}>{w.hard ? t('hard') : t('soft')}</Chip>
                  {w.source !== 'FORM' ? (
                    <Chip tone="absent" icon={w.source === 'AI' ? Sparkles : Languages}>
                      {w.source === 'AI' ? t('fromAi') : t('fromText')}
                    </Chip>
                  ) : null}
                </div>
                <Switch
                  checked={w.hard}
                  label={t('hardSwitch')}
                  onCheckedChange={(v) => patch.mutate({ id: w.id, hard: v })}
                />
                <Switch
                  checked={w.active}
                  label={t('activeSwitch')}
                  onCheckedChange={(v) => patch.mutate({ id: w.id, active: v })}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`${t('delete')}: ${w.summary}`}
                  onClick={() => remove.mutate(w.id)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={(e) => void onTranslate(e)} className="flex flex-col gap-3" noValidate>
        <Textarea
          label={t('wishText')}
          hint={ai ? t('wishTextHintAi') : t('wishTextHint')}
          value={text}
          rows={3}
          maxLength={2000}
          placeholder={t('wishPlaceholder')}
          onChange={(e) => setText(e.target.value)}
        />
        {translate.error ? <FormError message={problem(translate.error)} /> : null}
        <Button
          type="submit"
          variant="secondary"
          iconLeft={Languages}
          loading={translate.isPending}
          disabled={text.trim().length < 3}
          className="self-start"
        >
          {t('translate')}
        </Button>
      </form>

      {result ? (
        <section
          aria-labelledby="proposals-h"
          className="flex flex-col gap-3 rounded-lg bg-bg-sunken p-4"
        >
          <h3 id="proposals-h" className="text-label">
            {t('proposals')}
          </h3>
          {result.proposals.length ? (
            <div className="flex flex-col gap-1">
              {result.proposals.map((p, i) => (
                <Checkbox
                  key={i}
                  label={`${p.summary}${p.constraint.hard ? '' : ` (${t('soft')})`}`}
                  hint={`„${p.sentence}“`}
                  checked={chosen.has(i)}
                  onChange={(e) => {
                    const next = new Set(chosen);
                    if (e.target.checked) next.add(i);
                    else next.delete(i);
                    setChosen(next);
                  }}
                />
              ))}
            </div>
          ) : null}
          {result.unresolved.length ? (
            <Banner icon={TriangleAlert}>
              <p className="text-body-strong">{t('unresolved')}</p>
              <ul className="list-disc pl-5 text-body-sm">
                {result.unresolved.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </Banner>
          ) : null}
          {save.error ? <FormError message={problem(save.error)} /> : null}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => void onSave()}
              loading={save.isPending}
              disabled={chosen.size === 0}
            >
              {t('saveWishes', { count: chosen.size })}
            </Button>
            <Button variant="ghost" onClick={() => setResult(null)}>
              {t('discard')}
            </Button>
          </div>
        </section>
      ) : null}
    </Card>
  );
}
