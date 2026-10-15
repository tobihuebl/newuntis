import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import type { Tx } from '@sp/db';
import {
  addDays,
  can,
  consentOpen,
  countAnswers,
  hasScope,
  type ConsentAnswer,
  type ConsentFormDetail,
  type ConsentFormInput,
  type ConsentFormItem,
  type ConsentFormOptions,
  type MyConsentForm,
  type PolicyUser,
} from '@sp/shared';
import type { Principal } from '../../common/request';
import { AuditService } from '../audit/audit.service';
import { QueueService } from '../jobs/queue.service';
import { currentEnrollments, fullName, guardianLinks, reachable } from '../messages/recipients';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { asDate, todayIn } from '../timetable/data';

export const QUEUE_CONSENT = 'consent-forms-daily';
/** Manuelle Erinnerung höchstens einmal in diesem Abstand. */
const REMIND_GAP_HOURS = 20;
const URL = '/einverstaendnis';

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * Einverständniserklärungen (KO-05, ADR 0021). Wer verschickt, sieht alle Antworten; Lehrkräfte der Klasse,
 * Klassenvorstand, Direktion und Administration sehen die Antworten der Klassen, für die sie zuständig sind.
 */
@Injectable()
export class ConsentFormsService implements OnModuleInit {
  private readonly logger = new Logger(ConsentFormsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly queue: QueueService,
  ) {}

  onModuleInit(): void {
    this.queue.register(QUEUE_CONSENT, () => this.dailyAllTenants(), { cron: '0 17 * * *' });
  }

  private async tz(tx: Tx, tenantId: string) {
    return (
      await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true } })
    ).timezone;
  }

  /** Klassen, für die die Person Erklärungen verschicken und Antworten sehen darf (null = alle). */
  private scope(user: PolicyUser): Set<string> | null {
    if (hasScope(user, 'consentForm.manage', 'ALL')) return null;
    return new Set([...(user.teachesClassIds ?? []), ...(user.homeroomClassIds ?? [])]);
  }

  /** Eltern mit Konto je Kind (für "nur auf Papier möglich"). */
  private async guardiansOf(tx: Tx, studentIds: string[], day: string) {
    const links = await guardianLinks(tx, studentIds, day);
    const ok = new Set(
      (
        await tx.person.findMany({
          where: { id: { in: [...new Set(links.map((l) => l.guardianId))] }, ...reachable },
          select: { id: true },
        })
      ).map((p) => p.id),
    );
    const by = new Map<string, string[]>();
    for (const l of links)
      if (ok.has(l.guardianId)) by.set(l.studentId, [...(by.get(l.studentId) ?? []), l.guardianId]);
    return by;
  }

  async options(tx: Tx, tenantId: string, user: PolicyUser): Promise<ConsentFormOptions> {
    const day = todayIn(await this.tz(tx, tenantId));
    const scope = this.scope(user);
    const classes = await tx.schoolClass.findMany({
      where: {
        schoolYear: { isCurrent: true },
        ...(scope ? { id: { in: [...scope] } } : {}),
      },
      select: { id: true, name: true },
    });
    const enr = await currentEnrollments(tx, { classId: { in: classes.map((c) => c.id) } }, day);
    const students = await tx.person.findMany({
      where: { id: { in: enr.map((e) => e.studentId) }, anonymizedAt: null },
      select: { id: true, firstName: true, lastName: true },
    });
    const name = new Map(students.map((s) => [s.id, `${s.lastName} ${s.firstName}`]));
    const guardians = await this.guardiansOf(tx, [...name.keys()], day);
    return {
      classes: classes
        .sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }))
        .map((c) => ({
          id: c.id,
          name: c.name,
          students: enr
            .filter((e) => e.classId === c.id && name.has(e.studentId))
            .map((e) => ({
              id: e.studentId,
              name: name.get(e.studentId)!,
              guardians: guardians.get(e.studentId)?.length ?? 0,
            }))
            .sort((a, b) => a.name.localeCompare(b.name, 'de')),
        })),
    };
  }

  async create(
    tx: Tx,
    tenantId: string,
    me: Principal,
    user: PolicyUser,
    input: ConsentFormInput,
  ): Promise<{ id: string; notified: number }> {
    const day = todayIn(await this.tz(tx, tenantId));
    if (input.dueOn && input.dueOn < day)
      throw new BadRequestException({ title: 'Die Frist liegt in der Vergangenheit' });
    const ids = [...new Set(input.studentIds)];
    const enr = await currentEnrollments(tx, { studentId: { in: ids } }, day);
    const classOf = new Map(enr.map((e) => [e.studentId, e.classId]));
    for (const id of ids) {
      const classId = classOf.get(id);
      if (!classId)
        throw new BadRequestException({ title: 'Mindestens eine Person ist in keiner Klasse' });
      if (!can(user, 'consentForm.manage', { classId }))
        throw new ForbiddenException({ title: 'Nur für Schüler:innen der eigenen Klassen' });
    }
    const form = await tx.consentForm.create({
      data: {
        tenantId,
        title: input.title,
        body: input.body,
        dueOn: input.dueOn ? asDate(input.dueOn) : null,
        createdById: me.personId,
      },
    });
    await tx.consentFormAnswer.createMany({
      data: ids.map((studentId) => ({
        tenantId,
        formId: form.id,
        studentId,
        classId: classOf.get(studentId)!,
      })),
    });
    const guardians = [...new Set([...(await this.guardiansOf(tx, ids, day)).values()].flat())];
    await this.notifications.emit(tx, tenantId, 'consent.requested', guardians, { url: URL });
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'consentForm.create',
      entity: 'consentForm',
      entityId: form.id,
      meta: { students: ids.length, guardians: guardians.length },
    });
    return { id: form.id, notified: guardians.length };
  }

  private async loadForm(tx: Tx, id: string) {
    const f = await tx.consentForm.findUnique({
      where: { id },
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
        answers: {
          include: {
            student: { select: { firstName: true, lastName: true } },
            answeredBy: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!f) throw new NotFoundException({ title: 'Einverständniserklärung nicht gefunden' });
    return f;
  }

  private async classNames(tx: Tx, ids: string[]) {
    const cs = await tx.schoolClass.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, name: true },
    });
    return new Map(cs.map((c) => [c.id, c.name]));
  }

  async list(tx: Tx, me: Principal, user: PolicyUser): Promise<ConsentFormItem[]> {
    const scope = this.scope(user);
    const forms = await tx.consentForm.findMany({
      where: scope
        ? {
            OR: [
              { createdById: me.personId },
              { answers: { some: { classId: { in: [...scope] } } } },
            ],
          }
        : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
        answers: { select: { answer: true, classId: true } },
      },
    });
    const names = await this.classNames(
      tx,
      forms.flatMap((f) => f.answers.map((a) => a.classId)),
    );
    return forms.map((f) => {
      const mine = f.createdById === me.personId;
      const rows = f.answers.filter((a) => mine || !scope || scope.has(a.classId));
      return {
        id: f.id,
        title: f.title,
        dueOn: iso(f.dueOn),
        createdAt: f.createdAt.toISOString(),
        createdBy: fullName(f.createdBy),
        classes: [...new Set(rows.map((a) => names.get(a.classId) ?? ''))].sort((a, b) =>
          a.localeCompare(b, 'de', { numeric: true }),
        ),
        closed: f.closedAt !== null,
        counts: countAnswers(rows),
      };
    });
  }

  /** Erklärung mit den Zeilen, die die Person sehen darf; ohne Zuständigkeit 403. */
  private async visible(tx: Tx, me: Principal, user: PolicyUser, id: string) {
    const f = await this.loadForm(tx, id);
    const scope = this.scope(user);
    const mine = f.createdById === me.personId;
    const rows = f.answers.filter((a) => mine || !scope || scope.has(a.classId));
    if (rows.length === 0 && !mine)
      throw new ForbiddenException({ title: 'Diese Erklärung betrifft keine deiner Klassen' });
    return { f, rows, mine, all: scope === null };
  }

  async detail(
    tx: Tx,
    tenantId: string,
    me: Principal,
    user: PolicyUser,
    id: string,
  ): Promise<ConsentFormDetail> {
    const { f, rows, mine } = await this.visible(tx, me, user, id);
    const day = todayIn(await this.tz(tx, tenantId));
    const names = await this.classNames(
      tx,
      rows.map((a) => a.classId),
    );
    const guardians = await this.guardiansOf(
      tx,
      rows.map((a) => a.studentId),
      day,
    );
    const out = rows
      .map((a) => ({
        studentId: a.studentId,
        name: `${a.student.lastName} ${a.student.firstName}`,
        className: names.get(a.classId) ?? '',
        answer: a.answer as ConsentAnswer,
        note: a.note,
        answeredBy: a.answeredBy ? fullName(a.answeredBy) : null,
        answeredAt: a.answeredAt?.toISOString() ?? null,
        onPaper: a.onPaper,
        guardians: guardians.get(a.studentId)?.length ?? 0,
      }))
      .sort(
        (a, b) =>
          a.className.localeCompare(b.className, 'de', { numeric: true }) ||
          a.name.localeCompare(b.name, 'de'),
      );
    return {
      id: f.id,
      title: f.title,
      body: f.body,
      dueOn: iso(f.dueOn),
      createdAt: f.createdAt.toISOString(),
      createdBy: fullName(f.createdBy),
      classes: [...new Set(out.map((r) => r.className))],
      closed: f.closedAt !== null,
      counts: countAnswers(out),
      mine,
      remindedAt: f.remindedAt?.toISOString() ?? null,
      rows: out,
    };
  }

  /** Erinnerung an die Eltern aller noch offenen Kinder (manuell höchstens einmal in 20 Stunden). */
  async remind(
    tx: Tx,
    tenantId: string,
    id: string,
    actor: { me: Principal; user: PolicyUser } | null,
  ): Promise<{ reminded: number }> {
    const f = actor
      ? (await this.visible(tx, actor.me, actor.user, id)).f
      : await this.loadForm(tx, id);
    const day = todayIn(await this.tz(tx, tenantId));
    if (!consentOpen({ closedAt: f.closedAt?.toISOString() ?? null, dueOn: iso(f.dueOn) }, day))
      throw new ConflictException({ title: 'Die Erklärung ist abgeschlossen' });
    if (actor && f.remindedAt && Date.now() - f.remindedAt.getTime() < REMIND_GAP_HOURS * 3600_000)
      throw new ConflictException({ title: 'Heute wurde bereits erinnert' });
    const open = f.answers.filter((a) => a.answer === 'OPEN').map((a) => a.studentId);
    const guardians = [...new Set([...(await this.guardiansOf(tx, open, day)).values()].flat())];
    await tx.consentForm.update({ where: { id }, data: { remindedAt: new Date() } });
    await this.notifications.emit(tx, tenantId, 'consent.reminder', guardians, { url: URL });
    await this.audit.record({
      tenantId,
      actorId: actor?.me.personId ?? null,
      action: 'consentForm.remind',
      entity: 'consentForm',
      entityId: id,
      meta: { guardians: guardians.length, manual: actor !== null },
    });
    return { reminded: guardians.length };
  }

  /** Abschließen: keine Antworten mehr in der App (nur wer verschickt hat, Direktion, Administration). */
  async close(tx: Tx, tenantId: string, me: Principal, user: PolicyUser, id: string) {
    const { f, mine, all } = await this.visible(tx, me, user, id);
    if (!mine && !all)
      throw new ForbiddenException({
        title: 'Abschließen kann nur, wer die Erklärung verschickt hat',
      });
    if (f.closedAt) return;
    await tx.consentForm.update({ where: { id }, data: { closedAt: new Date() } });
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'consentForm.close',
      entity: 'consentForm',
      entityId: id,
    });
  }

  /** Antwort auf Papier nachtragen (oder mit OPEN zurücknehmen); auch nach der Frist möglich. */
  async paper(
    tx: Tx,
    tenantId: string,
    me: Principal,
    user: PolicyUser,
    id: string,
    studentId: string,
    answer: ConsentAnswer,
  ) {
    const { rows } = await this.visible(tx, me, user, id);
    const row = rows.find((r) => r.studentId === studentId);
    if (!row) throw new NotFoundException({ title: 'Diese Person ist nicht angefragt' });
    if (!row.onPaper && row.answer !== 'OPEN')
      throw new ConflictException({ title: 'Die Eltern haben bereits in der App geantwortet' });
    await tx.consentFormAnswer.update({
      where: { id: row.id },
      data:
        answer === 'OPEN'
          ? { answer, onPaper: false, answeredById: null, answeredAt: null, note: null }
          : { answer, onPaper: true, answeredById: me.personId, answeredAt: new Date() },
    });
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'consentForm.paper',
      entity: 'consentForm',
      entityId: id,
      meta: { answer },
    });
  }

  // ───────────────────────── Eltern ─────────────────────────

  async mine(tx: Tx, tenantId: string, user: PolicyUser): Promise<MyConsentForm[]> {
    const children = user.guardianOfStudentIds ?? [];
    if (children.length === 0) return [];
    const day = todayIn(await this.tz(tx, tenantId));
    const rows = await tx.consentFormAnswer.findMany({
      where: { studentId: { in: [...children] } },
      include: {
        student: { select: { firstName: true } },
        answeredBy: { select: { firstName: true, lastName: true } },
        form: { include: { createdBy: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    const out = new Map<string, MyConsentForm>();
    for (const r of rows) {
      const f = r.form;
      const item =
        out.get(f.id) ??
        ({
          id: f.id,
          title: f.title,
          body: f.body,
          dueOn: iso(f.dueOn),
          createdAt: f.createdAt.toISOString(),
          createdBy: fullName(f.createdBy),
          closed: !consentOpen(
            { closedAt: f.closedAt?.toISOString() ?? null, dueOn: iso(f.dueOn) },
            day,
          ),
          children: [],
        } satisfies MyConsentForm);
      item.children.push({
        studentId: r.studentId,
        firstName: r.student.firstName,
        answer: r.answer as ConsentAnswer,
        note: r.note,
        answeredBy: r.answeredBy ? fullName(r.answeredBy) : null,
        answeredAt: r.answeredAt?.toISOString() ?? null,
        onPaper: r.onPaper,
      });
      out.set(f.id, item);
    }
    return [...out.values()];
  }

  async answer(
    tx: Tx,
    tenantId: string,
    me: Principal,
    user: PolicyUser,
    id: string,
    studentId: string,
    input: { answer: 'YES' | 'NO'; note: string | null },
  ) {
    if (!can(user, 'consentForm.answer', { studentId }))
      throw new ForbiddenException({ title: 'Nur für die eigenen Kinder' });
    const row = await tx.consentFormAnswer.findUnique({
      where: { formId_studentId: { formId: id, studentId } },
      include: { form: true },
    });
    if (!row) throw new NotFoundException({ title: 'Einverständniserklärung nicht gefunden' });
    const day = todayIn(await this.tz(tx, tenantId));
    if (
      !consentOpen(
        { closedAt: row.form.closedAt?.toISOString() ?? null, dueOn: iso(row.form.dueOn) },
        day,
      )
    )
      throw new ConflictException({
        title: 'Die Frist ist vorbei. Bitte wenden Sie sich an die Lehrkraft.',
      });
    await tx.consentFormAnswer.update({
      where: { id: row.id },
      data: {
        answer: input.answer,
        note: input.note,
        answeredById: me.personId,
        answeredAt: new Date(),
        onPaper: false,
      },
    });
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'consentForm.answer',
      entity: 'consentForm',
      entityId: id,
      meta: { answer: input.answer },
    });
  }

  // ───────────────────────── Erinnerung vor der Frist ─────────────────────────

  async dailyAllTenants(): Promise<void> {
    const tenants = await this.prisma.client.tenant.findMany({ select: { id: true, slug: true } });
    for (const t of tenants) {
      try {
        const n = await this.prisma.runAsTenant(t.id, (tx) => this.daily(tx, t.id), {
          timeoutMs: 60_000,
        });
        if (n) this.logger.log(`Einverständnis ${t.slug}: ${n} Erinnerung(en)`);
      } catch (err) {
        this.logger.error(
          `Einverständnis ${t.slug}: ${err instanceof Error ? err.message : 'Fehler'}`,
        );
      }
    }
  }

  /** Am Tag vor der Frist einmal automatisch an offene Antworten erinnern. */
  async daily(tx: Tx, tenantId: string): Promise<number> {
    const day = todayIn(await this.tz(tx, tenantId));
    const due = await tx.consentForm.findMany({
      where: {
        closedAt: null,
        dueOn: asDate(addDays(day, 1)),
        answers: { some: { answer: 'OPEN' } },
        OR: [{ remindedAt: null }, { remindedAt: { lt: new Date(Date.now() - 12 * 3600_000) } }],
      },
      select: { id: true },
    });
    for (const f of due) await this.remind(tx, tenantId, f.id, null);
    return due.length;
  }
}
