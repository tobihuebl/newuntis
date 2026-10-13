'use client';
import { ArrowLeft, Pencil, Plus, Send, UserX } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Button,
  Card,
  Checkbox,
  EmptyState,
  Input,
  ListRow,
  Select,
  Sheet,
  useToast,
  type SelectOption,
} from '@sp/ui';
import { dateTimeOf, shortDate } from '../../lib/dates';
import { AccountChip } from './persons-list';
import { ApiError, apiRequest } from '../../lib/api-client';
import { GuardianCodes } from './guardian-codes';
import { PersonPicker } from './person-picker';
import { useT } from '../../lib/i18n';
import { PageTitle } from '../page-title';
import { FormError } from '../form-bits';

interface LinkRow {
  id: string;
  canExcuse: boolean;
  validFrom: string | null;
  validTo: string | null;
  student?: { id: string; firstName: string; lastName: string };
  guardian?: { id: string; firstName: string; lastName: string; email: string | null };
}
export interface PersonData {
  id: string;
  kind: 'STUDENT' | 'TEACHER' | 'GUARDIAN' | 'STAFF';
  firstName: string;
  lastName: string;
  birthDate: string | null;
  email: string | null;
  externalId: string | null;
  anonymized: boolean;
  roles: { id: string; role: string; classId: string | null }[];
  account: {
    email: string;
    active: boolean;
    twoFactor: boolean;
    lastLoginAt: string | null;
  } | null;
  pendingInvitation: { id: string; expiresAt: string } | null;
  enrollments: {
    id: string;
    class: { id: string; name: string };
    fromDate: string | null;
    toDate: string | null;
  }[];
  children: LinkRow[];
  guardians: LinkRow[];
}

const today = () => new Date().toISOString().slice(0, 10);
const active = (l: LinkRow) => !l.validTo || l.validTo >= today();

export function PersonDetail({
  person,
  classes,
  csrfToken,
  readOnly,
  currentPersonId,
}: {
  person: PersonData;
  classes: SelectOption[];
  csrfToken: string;
  readOnly: boolean;
  currentPersonId: string;
}) {
  const t = useT('admin.persons');
  const p = useT('person');
  const c = useT('common');
  const router = useRouter();
  const [sheet, setSheet] = useState<'edit' | 'link' | 'anonymize' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const currentClass =
    person.enrollments.find((e) => !e.toDate || e.toDate >= today())?.class.id ?? '';
  const extraRoles = person.roles
    .map((r) => r.role)
    .filter((r) => r === 'PRINCIPAL' || r === 'ADMIN');
  const name = `${person.firstName} ${person.lastName}`.trim();

  async function run(fn: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      after?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.problem.title : c('error'));
    }
    setBusy(false);
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (n: string) => String(f.get(n) ?? '').trim() || null;
    const body: Record<string, unknown> = {
      firstName: text('firstName'),
      lastName: text('lastName'),
      email: text('email'),
      externalId: text('externalId'),
      birthDate: text('birthDate'),
    };
    if (person.kind === 'STUDENT') body.classId = text('classId');
    if (person.kind === 'TEACHER' || person.kind === 'STAFF')
      body.extraRoles = ['PRINCIPAL', 'ADMIN'].filter((r) => f.get(`role-${r}`) === 'on');
    await run(
      () => apiRequest('PATCH', `/admin/persons/${person.id}`, body, csrfToken),
      () => setSheet(null),
    );
  }

  async function invite() {
    await run(async () => {
      const res = await apiRequest<{ sent: number; skipped: { reason: string }[] }>(
        'POST',
        '/admin/invitations',
        { personIds: [person.id] },
        csrfToken,
      );
      toast({
        text:
          res.sent > 0
            ? p('inviteSent')
            : res.skipped[0]?.reason === 'activeAccount'
              ? p('inviteActive')
              : p('inviteNoEmail'),
      });
    });
  }

  if (person.anonymized) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pt-4 pb-8 lg:px-6 lg:pt-6">
        <Button variant="ghost" size="sm" asChild iconLeft={ArrowLeft}>
          <Link href="/admin/personen">{t('title')}</Link>
        </Button>
        <Card flat className="mt-2">
          <EmptyState title={p('anonymized')} />
        </Card>
      </div>
    );
  }

  const links = person.kind === 'GUARDIAN' ? person.children : person.guardians;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-4 pb-8 lg:px-6 lg:pt-6">
      <div className="flex flex-col gap-2">
        <Button variant="ghost" size="sm" asChild iconLeft={ArrowLeft} className="self-start">
          <Link href="/admin/personen">{t('title')}</Link>
        </Button>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageTitle area="stammdaten" docTitle={t(`kinds.${person.kind}`)}>
            {name}
          </PageTitle>
          {readOnly ? null : (
            <Button
              variant="secondary"
              iconLeft={Pencil}
              onClick={() => {
                setError(null);
                setSheet('edit');
              }}
            >
              {c('edit')}
            </Button>
          )}
        </div>
        <p className="text-body-sm text-ink-muted">{t(`kinds.${person.kind}`)}</p>
      </div>

      <Card className="flex flex-col gap-1">
        <Row label={t('email')} value={person.email} />
        {person.kind === 'STUDENT' ? (
          <Row label={t('externalId')} value={person.externalId} />
        ) : null}
        {person.kind === 'STUDENT' ? <Row label={t('birthDate')} value={person.birthDate} /> : null}
        <Row label={t('roles')} value={[...new Set(person.roles.map((r) => r.role))].join(', ')} />
      </Card>

      <Card className="flex flex-col gap-2">
        <h2 className="text-h3">{p('account')}</h2>
        {person.account ? (
          <>
            <Row label={t('email')} value={person.account.email} />
            <Row label={p('twoFactor')} value={person.account.twoFactor ? c('yes') : c('no')} />
            <Row
              label={p('lastLogin')}
              value={
                person.account.lastLoginAt ? dateTimeOf(person.account.lastLoginAt) : p('never')
              }
            />
          </>
        ) : person.pendingInvitation ? (
          <p className="flex flex-wrap items-center gap-2 text-body-sm">
            <AccountChip account="invited" />
            {p('pending')} {shortDate(person.pendingInvitation.expiresAt.slice(0, 10))}
          </p>
        ) : (
          <p>
            <AccountChip account="none" />
          </p>
        )}
        {readOnly || person.kind === 'STUDENT' || person.account?.active ? null : (
          <Button
            variant="secondary"
            iconLeft={Send}
            onClick={invite}
            loading={busy}
            className="self-start"
          >
            {p('invite')}
          </Button>
        )}
        {error && !sheet ? <FormError message={error} /> : null}
      </Card>

      {person.kind === 'STUDENT' ? (
        <Card className="p-0">
          <h2 className="border-b border-line px-4 py-3 text-h3">{p('enrollments')}</h2>
          {person.enrollments.length === 0 ? (
            <p className="p-4 text-body-sm text-ink-muted">{t('noClass')}</p>
          ) : null}
          {person.enrollments.map((e) => (
            <ListRow
              key={e.id}
              title={e.class.name}
              subtitle={`${p('from')} ${e.fromDate ? shortDate(e.fromDate) : '–'}${e.toDate ? ` ${p('to')} ${shortDate(e.toDate)}` : ''}`}
            />
          ))}
        </Card>
      ) : null}

      {person.kind === 'STUDENT' || person.kind === 'GUARDIAN' ? (
        <Card className="p-0">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-h3">
              {person.kind === 'GUARDIAN' ? p('children') : p('guardians')}
            </h2>
            {readOnly ? null : (
              <Button
                variant="secondary"
                size="sm"
                iconLeft={Plus}
                onClick={() => {
                  setError(null);
                  setSheet('link');
                }}
              >
                {p('linkAdd')}
              </Button>
            )}
          </div>
          {links.filter(active).length === 0 ? (
            <p className="p-4 text-body-sm text-ink-muted">{p('linkNone')}</p>
          ) : null}
          {links.filter(active).map((l) => {
            const other = l.student ?? l.guardian!;
            return (
              <ListRow
                key={l.id}
                title={
                  <Link
                    className="pf-focusable text-brand-text underline underline-offset-4"
                    href={`/admin/personen/${other.id}`}
                  >{`${other.lastName} ${other.firstName}`}</Link>
                }
                subtitle={`${p('from')} ${l.validFrom ? shortDate(l.validFrom) : '–'}${l.canExcuse ? ` · ${p('canExcuse')}` : ''}`}
                trailing={
                  readOnly ? null : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        run(() =>
                          apiRequest(
                            'DELETE',
                            `/admin/guardian-links/${l.id}`,
                            undefined,
                            csrfToken,
                          ),
                        )
                      }
                    >
                      {p('linkRevoke')}
                    </Button>
                  )
                }
              />
            );
          })}
        </Card>
      ) : null}

      {person.kind === 'STUDENT' && !readOnly ? (
        <Card>
          <GuardianCodes
            studentIds={[person.id]}
            csrfToken={csrfToken}
            label={p('code')}
            scope={name}
          />
        </Card>
      ) : null}

      {readOnly || person.id === currentPersonId ? null : (
        <Card className="flex flex-col gap-2">
          <h2 className="text-h3">{p('anonymize')}</h2>
          <p className="text-body-sm text-ink-muted">{p('anonymizeHelp')}</p>
          <Button
            variant="danger"
            iconLeft={UserX}
            className="self-start"
            onClick={() => {
              setError(null);
              setSheet('anonymize');
            }}
          >
            {p('anonymize')}
          </Button>
        </Card>
      )}

      <Sheet
        open={sheet === 'edit'}
        onOpenChange={(o) => !o && setSheet(null)}
        title={c('edit')}
        closeLabel={c('close')}
      >
        <form onSubmit={save} className="flex flex-col gap-4" noValidate>
          <Input label={t('firstName')} name="firstName" defaultValue={person.firstName} required />
          <Input label={t('lastName')} name="lastName" defaultValue={person.lastName} required />
          <Input label={t('email')} name="email" type="email" defaultValue={person.email ?? ''} />
          {person.kind === 'STUDENT' ? (
            <>
              <Input
                label={t('externalId')}
                name="externalId"
                defaultValue={person.externalId ?? ''}
              />
              <Input
                label={t('birthDate')}
                name="birthDate"
                type="date"
                defaultValue={person.birthDate ?? ''}
              />
              <Select
                label={t('class')}
                name="classId"
                options={classes}
                emptyLabel={t('noClass')}
                defaultValue={currentClass}
              />
            </>
          ) : null}
          {person.kind === 'TEACHER' || person.kind === 'STAFF' ? (
            <fieldset className="flex flex-col">
              <legend className="text-label">{t('roles')}</legend>
              <Checkbox
                name="role-PRINCIPAL"
                label={t('extra.PRINCIPAL')}
                defaultChecked={extraRoles.includes('PRINCIPAL')}
              />
              <Checkbox
                name="role-ADMIN"
                label={t('extra.ADMIN')}
                defaultChecked={extraRoles.includes('ADMIN')}
              />
            </fieldset>
          ) : null}
          {error ? <FormError message={error} /> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setSheet(null)}>
              {c('cancel')}
            </Button>
            <Button type="submit" loading={busy}>
              {c('save')}
            </Button>
          </div>
        </form>
      </Sheet>

      <Sheet
        open={sheet === 'link'}
        onOpenChange={(o) => !o && setSheet(null)}
        title={p('linkAdd')}
        closeLabel={c('close')}
      >
        <PersonPicker
          kind={person.kind === 'GUARDIAN' ? 'STUDENT' : 'GUARDIAN'}
          label={p('pickPerson')}
          onPick={(otherId) =>
            run(
              () =>
                apiRequest(
                  'POST',
                  '/admin/guardian-links',
                  person.kind === 'GUARDIAN'
                    ? { guardianId: person.id, studentId: otherId }
                    : { guardianId: otherId, studentId: person.id },
                  csrfToken,
                ),
              () => setSheet(null),
            )
          }
        />
        {error ? <FormError message={error} /> : null}
      </Sheet>

      <Sheet
        open={sheet === 'anonymize'}
        onOpenChange={(o) => !o && setSheet(null)}
        title={p('anonymizeConfirm')}
        description={p('anonymizeHelp')}
        closeLabel={c('close')}
      >
        {error ? <FormError message={error} /> : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setSheet(null)}>
            {c('cancel')}
          </Button>
          <Button
            variant="danger"
            loading={busy}
            onClick={() =>
              run(
                () => apiRequest('DELETE', `/admin/persons/${person.id}`, undefined, csrfToken),
                () => router.push('/admin/personen'),
              )
            }
          >
            {p('anonymize')}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 border-b border-line py-2 text-body-sm last:border-b-0">
      <span className="text-ink-muted">{label}</span>
      <span className="text-label">{value || '–'}</span>
    </div>
  );
}
