'use client';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BellRing, Megaphone, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { AnnouncementDetail, AnnouncementItem, Audience, AudienceRole } from '@sp/shared';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Input,
  SegmentedControl,
  Skeleton,
  Switch,
  Textarea,
} from '@sp/ui';
import { apiRequest } from '../../lib/api-client';
import { dateTimeOf } from '../../lib/dates';
import { useApi, useProblemText } from '../../lib/use-api';
import { useSession } from '../providers';

function Progress({ read, total, label }: { read: number; total: number; label: string }) {
  const pct = total ? Math.round((read / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={read}
        className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
      >
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted tabular-nums">{label}</span>
    </div>
  );
}

/** Rundschreiben der Schule (Direktion, Administration): Liste mit Lesestand. */
export function AnnouncementsAdmin() {
  const t = useTranslations('announcements');
  const tc = useTranslations('common');
  const q = useInfiniteQuery({
    queryKey: ['announcements', 'sent'],
    queryFn: ({ pageParam }) =>
      apiRequest<{ data: AnnouncementItem[]; nextCursor: string | null }>(
        'GET',
        `/announcements?view=sent&limit=30${pageParam ? `&cursor=${pageParam}` : ''}`,
      ),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = q.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <Button asChild>
          <Link href="/rundschreiben/neu">
            <Plus aria-hidden="true" size={18} />
            {t('new')}
          </Link>
        </Button>
      </div>
      {q.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState title={t('empty')} description={t('emptyText')} />
        </Card>
      ) : (
        <Card className="p-0">
          <ul>
            {items.map((a) => (
              <li key={a.id} className="border-b border-border last:border-b-0">
                <Link
                  href={`/rundschreiben/${a.id}`}
                  className="flex min-h-16 items-start gap-3 px-4 py-3 hover:bg-surface-2"
                >
                  <Megaphone aria-hidden="true" size={18} className="mt-1 shrink-0 text-muted" />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate font-medium">{a.title}</span>
                    <span className="text-sm text-muted">
                      {a.author} · {dateTimeOf(a.publishedAt)}
                    </span>
                    {a.stats ? (
                      <Progress
                        read={a.stats.read}
                        total={a.stats.recipients}
                        label={t('readOf', { read: a.stats.read, total: a.stats.recipients })}
                      />
                    ) : null}
                  </span>
                  {a.requiresRead ? <Badge tone="info">{t('requiresRead')}</Badge> : null}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {q.hasNextPage ? (
        <Button variant="secondary" onClick={() => void q.fetchNextPage()} className="self-center">
          {tc('loadMore')}
        </Button>
      ) : null}
    </div>
  );
}

interface Option {
  id: string;
  name: string;
}

/** Neues Rundschreiben: Zielgruppe (Rollen, ganze Schule oder Klassen/Gruppen), Lesebestätigung. */
export function AnnouncementForm() {
  const t = useTranslations('announcements');
  const problem = useProblemText();
  const { csrfToken } = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const classes = useApi<{ data: Option[] }>(['admin', 'classes'], '/admin/classes');
  const groups = useApi<{ data: Option[] }>(['admin', 'groups'], '/admin/groups');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [roles, setRoles] = useState<AudienceRole[]>(['GUARDIAN']);
  const [scope, setScope] = useState<'school' | 'selection'>('school');
  const [classIds, setClassIds] = useState<string[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [requiresRead, setRequiresRead] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audience: Audience = {
    roles,
    classIds: scope === 'school' ? [] : classIds,
    groupIds: scope === 'school' ? [] : groupIds,
  };
  const valid = roles.length > 0 && (scope === 'school' || classIds.length + groupIds.length > 0);
  const key = JSON.stringify(audience);

  useEffect(() => {
    if (!valid) return setCount(null);
    const h = setTimeout(() => {
      const audience = JSON.parse(key) as Audience;
      apiRequest<{ count: number }>('POST', '/announcements/preview', { audience }, csrfToken)
        .then((r) => setCount(r.count))
        .catch(() => setCount(null));
    }, 300);
    return () => clearTimeout(h);
  }, [key, valid, csrfToken]);

  const toggle = <T extends string>(list: T[], v: T) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await apiRequest<{ id: string }>(
        'POST',
        '/announcements',
        { title, body, audience, requiresRead },
        csrfToken,
      );
      await qc.invalidateQueries({ queryKey: ['announcements'] });
      router.push(`/rundschreiben/${r.id}`);
    } catch (err) {
      setError(problem(err));
      setBusy(false);
    }
  }

  const pickList = (
    label: string,
    options: Option[],
    value: string[],
    set: (v: string[]) => void,
  ) =>
    options.length ? (
      <fieldset className="flex flex-col">
        <legend className="mb-1 text-sm font-medium">{label}</legend>
        <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-4">
          {options.map((o) => (
            <Checkbox
              key={o.id}
              label={o.name}
              checked={value.includes(o.id)}
              onChange={() => set(toggle(value, o.id))}
            />
          ))}
        </div>
      </fieldset>
    ) : null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <Button variant="ghost" asChild className="self-start">
        <Link href="/rundschreiben">
          <ArrowLeft aria-hidden="true" size={18} />
          {t('back')}
        </Link>
      </Button>
      <h1 className="text-2xl font-semibold">{t('new')}</h1>
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <Input
          label={t('fieldTitle')}
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Textarea
          label={t('fieldBody')}
          value={body}
          rows={8}
          maxLength={10000}
          onChange={(e) => setBody(e.target.value)}
        />
        <fieldset className="flex flex-col">
          <legend className="mb-1 text-sm font-medium">{t('roles')}</legend>
          {(['GUARDIAN', 'STUDENT', 'TEACHER'] as const).map((r) => (
            <Checkbox
              key={r}
              label={t(`role${r}`)}
              checked={roles.includes(r)}
              onChange={() => setRoles(toggle(roles, r))}
            />
          ))}
        </fieldset>
        <SegmentedControl
          label={t('scope')}
          value={scope}
          onChange={setScope}
          options={[
            { value: 'school', label: t('scopeSchool') },
            { value: 'selection', label: t('scopeSelection') },
          ]}
        />
        {scope === 'selection' ? (
          classes.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              {pickList(t('classes'), classes.data?.data ?? [], classIds, setClassIds)}
              {pickList(t('groups'), groups.data?.data ?? [], groupIds, setGroupIds)}
            </>
          )
        ) : null}
        <div className="flex flex-col gap-1">
          <Switch
            checked={requiresRead}
            onCheckedChange={setRequiresRead}
            label={t('requiresReadLabel')}
          />
          <p className="text-sm text-muted">{t('requiresReadHelp')}</p>
        </div>
        <p role="status" className="text-sm">
          {count === null ? '' : t('recipients', { count })}
        </p>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <Button
          type="submit"
          disabled={busy || !valid || !title.trim() || !body.trim() || count === 0}
          className="self-start"
        >
          <Megaphone aria-hidden="true" size={18} />
          {t('publish')}
        </Button>
      </form>
    </div>
  );
}

/** Lesestand eines Rundschreibens mit Liste der Ausstehenden und Erinnerung. */
export function AnnouncementStats({ id }: { id: string }) {
  const t = useTranslations('announcements');
  const tc = useTranslations('common');
  const problem = useProblemText();
  const { csrfToken } = useSession();
  const qc = useQueryClient();
  const q = useApi<AnnouncementDetail>(['announcement', id], `/announcements/${id}`);
  const [msg, setMsg] = useState<string | null>(null);
  const a = q.data;

  const remind = async () => {
    setMsg(null);
    try {
      const r = await apiRequest<{ reminded: number }>(
        'POST',
        `/announcements/${id}/remind`,
        undefined,
        csrfToken,
      );
      setMsg(t('reminded', { count: r.reminded }));
      await qc.invalidateQueries({ queryKey: ['announcement', id] });
    } catch (err) {
      setMsg(problem(err));
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <Button variant="ghost" asChild className="self-start">
        <Link href="/rundschreiben">
          <ArrowLeft aria-hidden="true" size={18} />
          {t('back')}
        </Link>
      </Button>
      {q.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : !a ? (
        <Card>
          <EmptyState title={problem(q.error) ?? tc('error')} />
        </Card>
      ) : (
        <>
          <header>
            <h1 className="text-2xl font-semibold break-words">{a.title}</h1>
            <p className="text-sm text-muted">
              {a.author} · {dateTimeOf(a.publishedAt)}
            </p>
          </header>
          {a.stats ? (
            <Card className="flex flex-col gap-3">
              <Progress
                read={a.stats.read}
                total={a.stats.recipients}
                label={t('readOf', { read: a.stats.read, total: a.stats.recipients })}
              />
              {a.requiresRead && a.stats.read < a.stats.recipients ? (
                <Button variant="secondary" onClick={() => void remind()} className="self-start">
                  <BellRing aria-hidden="true" size={18} />
                  {t('remind')}
                </Button>
              ) : null}
              <p role="status" className="text-sm">
                {msg ?? ''}
              </p>
            </Card>
          ) : null}
          <Card>
            <p className="whitespace-pre-wrap break-words">{a.body}</p>
          </Card>
          {a.unread && a.unread.length > 0 ? (
            <section aria-labelledby="unread-h" className="flex flex-col gap-2">
              <h2 id="unread-h" className="text-lg font-semibold">
                {t('unreadList', { count: a.unread.length })}
              </h2>
              <Card className="p-0">
                <ul>
                  {a.unread.map((p) => (
                    <li
                      key={p.id}
                      className="flex min-h-11 items-center justify-between gap-2 border-b border-border px-4 last:border-b-0"
                    >
                      <span>{p.name}</span>
                      <Badge>{t(`kind${p.kind}`)}</Badge>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
