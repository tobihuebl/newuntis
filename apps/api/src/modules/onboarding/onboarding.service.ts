import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CHECKLIST_HIDDEN,
  ONBOARDING,
  PRIVACY_NOTICE_VERSION,
  composeSteps,
  flowsFor,
  median,
  type ComposedStep,
  type OnboardingContext,
  type OnboardingFlowId,
  type OnboardingFlowStats,
  type OnboardingState,
  type OnboardingStepState,
  type StepStatus,
  type StepUpdateInput,
} from '@sp/shared';
import type { Principal } from '../../common/request';
import type { PrismaService } from '../prisma/prisma.service';
import { asDate, todayIn } from '../timetable/data';

type Tx = PrismaService['tx'];

/** Frühester Zeitpunkt, zu dem ein datengetriebener Schritt erfüllt war (null = noch nicht). */
type Detector = (tx: Tx, p: Principal) => Promise<Date | null>;

const now = () => new Date();
const ifCount = async (n: Promise<number>) => ((await n) > 0 ? now() : null);
const first = async (row: Promise<{ createdAt: Date } | null>) => (await row)?.createdAt ?? null;

/**
 * Erledigt-Erkennung aus vorhandenen Daten: Einrichtung der Schule (Administration), Aha-Momente und Punkte der
 * Checkliste. Liefert den frühesten Zeitpunkt, damit time_to_aha stimmt, auch wenn die Erkennung später läuft.
 */
const DETECTORS: Record<string, Detector> = {
  adminSchoolYear: async (tx) =>
    (await tx.schoolYear.count()) > 0 ? ifCount(tx.schoolFreeDay.count()) : null,
  adminPeriods: (tx) => ifCount(tx.period.count()),
  adminMasterdata: async (tx) => {
    const [c, s, r] = await Promise.all([
      tx.schoolClass.count(),
      tx.subject.count(),
      tx.room.count(),
    ]);
    return c > 0 && s > 0 && r > 0 ? now() : null;
  },
  adminPersons: (tx) => ifCount(tx.roleAssignment.count({ where: { role: 'STUDENT' } })),
  adminAccess: async (tx) => {
    const [pr, te] = await Promise.all([
      tx.roleAssignment.count({ where: { role: 'PRINCIPAL' } }),
      tx.roleAssignment.count({ where: { role: 'TEACHER' } }),
    ]);
    return pr > 0 && te > 0 ? now() : null;
  },
  adminTimetable: async (tx) =>
    (
      await tx.timetableVersion.findFirst({
        where: { status: 'PUBLISHED', publishedAt: { not: null } },
        orderBy: { publishedAt: 'asc' },
        select: { publishedAt: true },
      })
    )?.publishedAt ?? null,
  adminInviteTeachers: (tx) =>
    first(
      tx.invitation.findFirst({
        where: { person: { roles: { some: { role: 'TEACHER' } } } },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ),
  principalAnnouncement: async (tx, p) =>
    (
      await tx.announcement.findFirst({
        where: { createdById: p.personId, publishedAt: { not: null } },
        orderBy: { publishedAt: 'asc' },
        select: { publishedAt: true },
      })
    )?.publishedAt ?? null,
  teacherFirstEntry: async (tx, p) => {
    const [a, e] = await Promise.all([
      first(
        tx.attendance.findFirst({
          where: { recordedById: p.personId },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        }),
      ),
      tx.classbookEntry.findFirst({
        where: { updatedById: p.personId },
        orderBy: { updatedAt: 'asc' },
        select: { updatedAt: true },
      }),
    ]);
    const dates = [a, e?.updatedAt ?? null].filter((d): d is Date => d !== null);
    return dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null;
  },
  homeroomLetters: (tx, p) =>
    first(
      tx.accessCode.findFirst({
        where: { createdById: p.personId },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ),
  teacherParentMessage: (tx, p) =>
    first(
      tx.message.findFirst({
        where: { senderId: p.personId },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ),
  guardianExcuse: (tx, p) =>
    first(
      tx.absence.findFirst({
        where: { reportedById: p.personId },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ),
  guardianMoreChildren: async (tx, p) =>
    (await tx.guardianLink.count({ where: { guardianId: p.personId, validTo: null } })) > 1
      ? now()
      : null,
  studentPush: (tx, p) =>
    first(
      tx.pushSubscription.findFirst({
        where: { personId: p.personId },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ),
};

/** Einrichtung der Schule: Stand immer aus den Daten (kann wieder offen werden), nicht gespeichert. */
const LIVE = new Set([
  'adminSchoolYear',
  'adminPeriods',
  'adminMasterdata',
  'adminPersons',
  'adminAccess',
]);

/**
 * Onboarding-Engine (ADR 0020): setzt die Flows der Rollen zusammen, hält den Fortschritt je Schritt und erkennt
 * datengetriebene Schritte. Der Guard der App fragt `needsFlow`.
 */
@Injectable()
export class OnboardingService {
  private homeroomClass(p: Principal) {
    return p.roles.find((r) => r.role === 'HOMEROOM' && r.classId)?.classId ?? null;
  }

  private steps(p: Principal): ComposedStep[] {
    return composeSteps(flowsFor(p.roles.map((r) => r.role)), {
      homeroom: this.homeroomClass(p) !== null,
    });
  }

  private async privacyDone(tx: Tx, p: Principal) {
    return (
      (await tx.consent.findUnique({
        where: {
          personId_kind_version: {
            personId: p.personId,
            kind: 'privacy-notice',
            version: PRIVACY_NOTICE_VERSION,
          },
        },
        select: { id: true },
      })) !== null
    );
  }

  /** Pflichtschritte offen? Ohne Erkennung der datengetriebenen Schritte (schnell, für jede Anfrage von /me). */
  async needsFlow(tx: Tx, p: Principal): Promise<boolean> {
    const required = this.steps(p).filter((s) => s.required);
    if (required.length === 0) return false;
    if (required.some((s) => s.id === 'privacy') && !(await this.privacyDone(tx, p))) return true;
    const rows = await tx.onboardingProgress.findMany({
      where: { userId: p.userId, stepId: { in: required.map((s) => s.id) } },
      select: { stepId: true, status: true },
    });
    const done = new Set(rows.filter((r) => r.status !== 'OPEN').map((r) => r.stepId));
    return required.some((s) => s.id !== 'privacy' && !done.has(s.id));
  }

  async state(tx: Tx, tenantId: string, p: Principal): Promise<OnboardingState> {
    const flows = flowsFor(p.roles.map((r) => r.role));
    const steps = this.steps(p);
    const classId = this.homeroomClass(p);
    const rows = await tx.onboardingProgress.findMany({ where: { userId: p.userId } });
    const byId = new Map(rows.map((r) => [r.stepId, r]));
    const privacy = await this.privacyDone(tx, p);

    const out: OnboardingStepState[] = [];
    for (const s of steps) {
      let status: StepStatus = byId.get(s.id)?.status ?? 'OPEN';
      if (s.id === 'privacy') status = privacy ? 'DONE' : 'OPEN';
      const detect = DETECTORS[s.id];
      if (s.auto && detect && (status === 'OPEN' || LIVE.has(s.id))) {
        const at = await detect(tx, p);
        if (LIVE.has(s.id)) status = at ? 'DONE' : 'OPEN';
        else if (at) {
          status = 'DONE';
          await this.write(tx, tenantId, p, s, { status: 'DONE', doneAt: at });
        }
      }
      const href = s.href
        ? s.href.includes('{class}')
          ? classId
            ? s.href.replace('{class}', classId)
            : null
          : s.href
        : null;
      out.push({
        id: s.id,
        flow: s.flow,
        phase: s.phase,
        required: s.required ?? false,
        auto: s.auto ?? false,
        desktop: s.desktop ?? false,
        status,
        href,
        anchor: s.anchor ?? null,
      });
    }
    return {
      flows,
      primary: flows[0] ?? null,
      steps: out,
      needsFlow: out.some((s) => s.required && s.status === 'OPEN'),
      checklistHidden: byId.get(CHECKLIST_HIDDEN)?.status === 'SKIPPED',
      context: await this.context(tx, tenantId, p, flows, classId),
    };
  }

  /** Fortschritt eines Schritts setzen (step_viewed, step_completed, step_skipped). */
  async update(tx: Tx, tenantId: string, p: Principal, input: StepUpdateInput) {
    if (input.stepId === CHECKLIST_HIDDEN) {
      if (input.status !== 'SKIPPED' && input.status !== 'OPEN')
        throw new BadRequestException({ title: 'Ungültiger Status für die Checkliste' });
      const primary = flowsFor(p.roles.map((r) => r.role))[0] ?? 'student';
      await this.write(
        tx,
        tenantId,
        p,
        { id: CHECKLIST_HIDDEN, flow: primary, phase: 'checklist' },
        { status: input.status },
      );
      return;
    }
    const s = this.steps(p).find((x) => x.id === input.stepId);
    if (!s || (s.id === 'privacy' && input.status !== 'VIEWED'))
      throw new BadRequestException({ title: 'Diesen Schritt gibt es für dich nicht' });
    if (input.status === 'VIEWED') {
      await this.write(tx, tenantId, p, s, { viewed: true });
    } else if (input.status === 'DONE') {
      if (s.auto)
        throw new BadRequestException({ title: 'Dieser Schritt erledigt sich von selbst' });
      await this.write(tx, tenantId, p, s, { status: 'DONE', doneAt: now() });
    } else if (input.status === 'SKIPPED') {
      if (s.required)
        throw new BadRequestException({ title: 'Pflichtschritte lassen sich nicht überspringen' });
      await this.write(tx, tenantId, p, s, { status: 'SKIPPED', doneAt: now() });
    } else {
      if (s.required) throw new BadRequestException({ title: 'Pflichtschritte bleiben erledigt' });
      await this.write(tx, tenantId, p, s, { status: 'OPEN', doneAt: null });
    }
    // Kompatibilität: onboardedAt markiert "Pflichtschritte erledigt"
    if (!(await this.needsFlow(tx, p))) {
      await tx.user.updateMany({
        where: { id: p.userId, onboardedAt: null },
        data: { onboardedAt: now() },
      });
    }
  }

  /** Datenschutzhinweis bestätigt (Zustimmung liegt in Consent; hier nur für die Auswertung). */
  async privacyAccepted(tx: Tx, tenantId: string, p: Principal) {
    const s = this.steps(p).find((x) => x.id === 'privacy');
    if (s) await this.write(tx, tenantId, p, s, { status: 'DONE', doneAt: now() });
  }

  private async write(
    tx: Tx,
    tenantId: string,
    p: Principal,
    s: Pick<ComposedStep, 'id' | 'flow' | 'phase'>,
    v: { status?: StepStatus; doneAt?: Date | null; viewed?: boolean },
  ) {
    const at = now();
    const existing = await tx.onboardingProgress.findUnique({
      where: { userId_stepId: { userId: p.userId, stepId: s.id } },
    });
    const viewedAt = existing?.viewedAt ?? (v.viewed || v.status ? (v.doneAt ?? at) : null);
    const data = {
      flow: s.flow,
      flowVersion: ONBOARDING[s.flow].version,
      viewedAt,
      ...(v.status ? { status: v.status } : {}),
      ...(v.doneAt !== undefined ? { doneAt: v.doneAt } : {}),
    };
    if (existing) {
      await tx.onboardingProgress.update({ where: { id: existing.id }, data });
    } else {
      await tx.onboardingProgress.create({
        data: { tenantId, userId: p.userId, stepId: s.id, ...data },
      });
    }
  }

  private async context(
    tx: Tx,
    tenantId: string,
    p: Principal,
    flows: OnboardingFlowId[],
    homeroomClassId: string | null,
  ): Promise<OnboardingContext> {
    const ctx: OnboardingContext = {};
    const tz = (
      await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true } })
    ).timezone;
    const today = asDate(todayIn(tz));
    const current = {
      OR: [{ toDate: null }, { toDate: { gte: today } }],
      fromDate: { lte: today },
    };
    if (flows.includes('teacher')) {
      const [person, lessons, homeroom] = await Promise.all([
        tx.person.findUniqueOrThrow({
          where: { id: p.personId },
          select: {
            employmentHours: true,
            teachingHours: true,
            teacherSubjects: { select: { subject: { select: { name: true } } } },
          },
        }),
        tx.lessonTeacher.findMany({
          where: {
            teacherId: p.personId,
            lesson: { timetable: { status: 'PUBLISHED', schoolYear: { isCurrent: true } } },
          },
          select: {
            lesson: {
              select: { class: { select: { name: true } }, group: { select: { name: true } } },
            },
          },
        }),
        homeroomClassId
          ? tx.schoolClass.findUnique({
              where: { id: homeroomClassId },
              select: { id: true, name: true },
            })
          : null,
      ]);
      const classes = new Set<string>();
      for (const l of lessons) {
        const n = l.lesson.class?.name ?? l.lesson.group?.name;
        if (n) classes.add(n);
      }
      ctx.teacher = {
        subjects: person.teacherSubjects
          .map((t) => t.subject.name)
          .sort((a, b) => a.localeCompare(b, 'de')),
        employmentHours: person.employmentHours,
        teachingHours: person.teachingHours,
        classes: [...classes].sort((a, b) => a.localeCompare(b, 'de', { numeric: true })),
        homeroomClass: homeroom,
      };
    }
    if (flows.includes('student')) {
      const e = await tx.enrollment.findFirst({
        where: { studentId: p.personId, ...current },
        orderBy: { fromDate: 'desc' },
        select: {
          class: {
            select: {
              name: true,
              homeroomTeacher: { select: { firstName: true, lastName: true } },
            },
          },
        },
      });
      const h = e?.class.homeroomTeacher;
      ctx.student = {
        className: e?.class.name ?? null,
        homeroomTeacher: h ? `${h.firstName} ${h.lastName}` : null,
        avatar: p.avatar,
      };
    }
    if (flows.includes('guardian')) {
      const links = await tx.guardianLink.findMany({
        where: {
          guardianId: p.personId,
          validFrom: { lte: today },
          OR: [{ validTo: null }, { validTo: { gte: today } }],
        },
        select: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              enrollments: {
                where: current,
                orderBy: { fromDate: 'desc' },
                take: 1,
                select: { class: { select: { name: true } } },
              },
            },
          },
        },
      });
      ctx.guardian = {
        children: links.map((l) => ({
          id: l.student.id,
          firstName: l.student.firstName,
          lastName: l.student.lastName,
          className: l.student.enrollments[0]?.class.name ?? null,
        })),
      };
    }
    return ctx;
  }

  /**
   * Auswertung je Flow ohne Personenbezug: wie viele sahen, erledigten oder übersprangen einen Schritt, wie viele
   * erreichten den Aha-Moment und wie lange es (Median) bis dahin dauerte.
   */
  async stats(tx: Tx): Promise<OnboardingFlowStats[]> {
    const rows = await tx.onboardingProgress.findMany({
      where: { flow: { not: 'legacy' } },
      select: {
        userId: true,
        flow: true,
        stepId: true,
        status: true,
        viewedAt: true,
        doneAt: true,
      },
    });
    return (Object.keys(ONBOARDING) as OnboardingFlowId[]).map((flow) => {
      const def = ONBOARDING[flow];
      const mine = rows.filter((r) => r.flow === flow);
      const aha = def.steps.find((s) => s.phase === 'aha');
      const firstSeen = new Map<string, number>();
      for (const r of mine) {
        if (!r.viewedAt) continue;
        const t = r.viewedAt.getTime();
        firstSeen.set(r.userId, Math.min(firstSeen.get(r.userId) ?? t, t));
      }
      const ahaRows = mine.filter((r) => r.stepId === aha?.id && r.status === 'DONE' && r.doneAt);
      const hours = ahaRows
        .map((r) => {
          const start = firstSeen.get(r.userId);
          return start === undefined ? null : Math.max(0, r.doneAt!.getTime() - start) / 3_600_000;
        })
        .filter((h): h is number => h !== null);
      const m = median(hours);
      return {
        flow,
        started: firstSeen.size,
        reachedAha: ahaRows.length,
        medianHoursToAha: m === null ? null : Math.round(m * 10) / 10,
        steps: def.steps
          .filter((s) => s.id !== 'privacy')
          .map((s) => {
            const rs = mine.filter((r) => r.stepId === s.id);
            return {
              stepId: s.id,
              phase: s.phase,
              viewed: rs.filter((r) => r.viewedAt).length,
              done: rs.filter((r) => r.status === 'DONE').length,
              skipped: rs.filter((r) => r.status === 'SKIPPED').length,
            };
          }),
      };
    });
  }
}
