'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Chip,
  Button,
  Card,
  Checkbox,
  Input,
  ListRow,
  Select,
  Sheet,
  type SelectOption,
} from '@sp/ui';
import { ApiError, apiRequest } from '../../lib/api-client';
import { GuardianCodes } from './guardian-codes';
import { PersonPicker } from './person-picker';
import { useT } from '../../lib/i18n';

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
  const [notice, setNotice] = useState<string | null>(null);
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
    setNotice(null);
    await run(async () => {
      const res = await apiRequest<{ sent: number; skipped: { reason: string }[] }>(
        'POST',
        '/admin/invitations',
        { personIds: [person.id] },
        csrfToken,
      );
      setNotice(
        res.sent > 0
          ? p('inviteSent')
          : res.skipped[0]?.reason === 'activeAccount'
            ? p('inviteActive')
            : p('inviteNoEmail'),
      );
    });
  }

  if (person.anonymized) {
    return (
      <div className="mx-auto max-w-3xl p-4">
        <Link href="/admin/personen" className="text-body-sm text-brand-text underline">
          {t('title')}
        </Link>
        <Card className="mt-2">{p('anonymized')}</Card>
      </div>
    );
  }

  const links = person.kind === 'GUARDIAN' ? person.children : person.guardians;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <div>
        <Link href="/admin/personen" className="text-body-sm text-brand-text underline">
          {t('title')}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-h1">{name}</h1>
          {readOnly ? null : (
            <Button
              variant="secondary"
              onClick={() => {
                setError(null);
                setSheet('edit');
              }}
            >
              {c('edit')}
            </Button>
          )}
        </div>
        <p className="text-ink-muted">{t(`kinds.${person.kind}`)}</p>
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
                person.account.lastLoginAt
                  ? person.account.lastLoginAt.slice(0, 16).replace('T', ' ')
                  : p('never')
              }
            />
          </>
        ) : person.pendingInvitation ? (
          <p>
            <Chip tone="ok">{t('account.invited')}</Chip> {p('pending')}{' '}
            {person.pendingInvitation.expiresAt.slice(0, 10)}
          </p>
        ) : (
          <p>
            <Chip>{t('account.none')}</Chip>
          </p>
        )}
        {readOnly || person.kind === 'STUDENT' || person.account?.active ? null : (
          <div>
            <Button variant="secondary" onClick={invite} disabled={busy}>
              {p('invite')}
            </Button>
          </div>
        )}
        {notice ? <p role="status">{notice}</p> : null}
        {error && !sheet ? (
          <p role="alert" className="text-body-sm text-danger-ink">
            {error}
          </p>
        ) : null}
      </Card>

      {person.kind === 'STUDENT' ? (
        <Card className="p-0">
          <h2 className="border-b border-line px-4 py-3 text-h3">{p('enrollments')}</h2>
          {person.enrollments.length === 0 ? (
            <p className="p-4 text-ink-muted">{t('noClass')}</p>
          ) : null}
          {person.enrollments.map((e) => (
            <ListRow
              key={e.id}
              title={e.class.name}
              subtitle={`${p('from')} ${e.fromDate ?? '–'}${e.toDate ? ` ${p('to')} ${e.toDate}` : ''}`}
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
            <p className="p-4 text-ink-muted">{p('linkNone')}</p>
          ) : null}
          {links.filter(active).map((l) => {
            const other = l.student ?? l.guardian!;
            return (
              <ListRow
                key={l.id}
                title={
                  <Link
                    className="text-brand-text underline"
                    href={`/admin/personen/${other.id}`}
                  >{`${other.lastName} ${other.firstName}`}</Link>
                }
                subtitle={`${p('from')} ${l.validFrom ?? '–'}${l.canExcuse ? ` · ${p('canExcuse')}` : ''}`}
                trailing={
                  readOnly ? null : (
                    <Button
                      variant="ghost"
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
          <h2 className="text-h3 text-danger-ink">{p('anonymize')}</h2>
          <p className="text-body-sm text-ink-muted">{p('anonymizeHelp')}</p>
          <div>
            <Button
              variant="danger"
              onClick={() => {
                setError(null);
                setSheet('anonymize');
              }}
            >
              {p('anonymize')}
            </Button>
          </div>
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
          {error ? (
            <p role="alert" className="text-body-sm text-danger-ink">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setSheet(null)}>
              {c('cancel')}
            </Button>
            <Button type="submit" disabled={busy}>
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
        {error ? (
          <p role="alert" className="text-body-sm text-danger-ink">
            {error}
          </p>
        ) : null}
      </Sheet>

      <Sheet
        open={sheet === 'anonymize'}
        onOpenChange={(o) => !o && setSheet(null)}
        title={p('anonymizeConfirm')}
        description={p('anonymizeHelp')}
        closeLabel={c('close')}
      >
        {error ? (
          <p role="alert" className="text-body-sm text-danger-ink">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setSheet(null)}>
            {c('cancel')}
          </Button>
          <Button
            variant="danger"
            disabled={busy}
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
    <div className="flex flex-wrap justify-between gap-2 border-b border-line py-2 last:border-b-0">
      <span className="text-ink-muted">{label}</span>
      <span>{value || '–'}</span>
    </div>
  );
}
