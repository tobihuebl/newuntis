import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import type { Prisma, Tx } from '@sp/db';
import {
  audienceSchema,
  tenantSettingsSchema,
  type AnnouncementDetail,
  type AnnouncementInput,
  type AnnouncementItem,
  type Audience,
  type Role,
} from '@sp/shared';
import type { Principal } from '../../common/request';
import { AuditService } from '../audit/audit.service';
import { EventsService } from '../events/events.service';
import { QueueService } from '../jobs/queue.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { todayIn } from '../timetable/data';
import { currentEnrollments, fullName, guardianLinks, reachable } from './recipients';

export const QUEUE_ANNOUNCEMENTS = 'announcements-daily';
/** Manuelle Erinnerung höchstens einmal in diesem Abstand. */
const REMIND_GAP_HOURS = 20;

type Row = Prisma.AnnouncementGetPayload<{
  include: { createdBy: { select: { firstName: true; lastName: true } } };
}>;

/** Rundschreiben mit Lesebestätigung (KO-02): Empfänger:innen werden bei Veröffentlichung festgehalten. */
@Injectable()
export class AnnouncementsService implements OnModuleInit {
  private readonly logger = new Logger(AnnouncementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
    private readonly notifications: NotificationsService,
    private readonly queue: QueueService,
  ) {}

  onModuleInit(): void {
    this.queue.register(QUEUE_ANNOUNCEMENTS, () => this.dailyAllTenants(), {
      cron: '0 17 * * *',
    });
  }

  /** Empfänger:innen einer Zielgruppe (erreichbar, ohne die absendende Person). */
  async resolveAudience(tx: Tx, tz: string, audience: Audience): Promise<string[]> {
    const day = todayIn(tz);
    const ids = new Set<string>();
    const scoped = audience.classIds.length > 0 || audience.groupIds.length > 0;
    const byRole = async (roles: Role[]) =>
      (
        await tx.person.findMany({
          where: { ...reachable, roles: { some: { role: { in: roles } } } },
          select: { id: true },
        })
      ).map((p) => p.id);

    if (!scoped) {
      if (audience.roles.includes('STUDENT')) for (const p of await byRole(['STUDENT'])) ids.add(p);
      if (audience.roles.includes('GUARDIAN'))
        for (const p of await byRole(['GUARDIAN'])) ids.add(p);
      if (audience.roles.includes('TEACHER'))
        for (const p of await byRole(['TEACHER', 'HOMEROOM'])) ids.add(p);
      return [...ids];
    }
    const enrolled = (
      await currentEnrollments(tx, { classId: { in: audience.classIds } }, day)
    ).map((e) => e.studentId);
    const members = (
      await tx.groupMember.findMany({
        where: { groupId: { in: audience.groupIds } },
        select: { studentId: true },
      })
    ).map((m) => m.studentId);
    const students = [...new Set([...enrolled, ...members])];
    const candidates = new Set<string>();
    if (audience.roles.includes('STUDENT')) for (const s of students) candidates.add(s);
    if (audience.roles.includes('GUARDIAN'))
      for (const l of await guardianLinks(tx, students, day)) candidates.add(l.guardianId);
    if (audience.roles.includes('TEACHER')) {
      const lessons = await tx.lesson.findMany({
        where: {
          timetable: { status: 'PUBLISHED' },
          OR: [{ classId: { in: audience.classIds } }, { groupId: { in: audience.groupIds } }],
        },
        select: { teachers: { select: { teacherId: true } } },
      });
      for (const l of lessons) for (const t of l.teachers) candidates.add(t.teacherId);
      const homerooms = await tx.roleAssignment.findMany({
        where: { role: 'HOMEROOM', classId: { in: audience.classIds } },
        select: { personId: true },
      });
      for (const h of homerooms) candidates.add(h.personId);
    }
    const ok = await tx.person.findMany({
      where: { ...reachable, id: { in: [...candidates] } },
      select: { id: true },
    });
    return ok.map((p) => p.id);
  }

  private async tz(tx: Tx, tenantId: string) {
    return (await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } })).timezone;
  }

  private async checkTargets(tx: Tx, audience: Audience) {
    const [classes, groups] = await Promise.all([
      tx.schoolClass.count({ where: { id: { in: audience.classIds } } }),
      tx.group.count({ where: { id: { in: audience.groupIds } } }),
    ]);
    if (classes !== new Set(audience.classIds).size || groups !== new Set(audience.groupIds).size)
      throw new BadRequestException({ title: 'Klasse oder Gruppe nicht gefunden' });
  }

  async preview(tx: Tx, tenantId: string, me: Principal, audience: Audience) {
    await this.checkTargets(tx, audience);
    const ids = await this.resolveAudience(tx, await this.tz(tx, tenantId), audience);
    return { count: ids.filter((p) => p !== me.personId).length };
  }

  async create(tx: Tx, tenantId: string, me: Principal, body: AnnouncementInput) {
    await this.checkTargets(tx, body.audience);
    const recipients = (
      await this.resolveAudience(tx, await this.tz(tx, tenantId), body.audience)
    ).filter((p) => p !== me.personId);
    if (recipients.length === 0)
      throw new BadRequestException({ title: 'Die Zielgruppe enthält niemanden mit Zugang' });
    const a = await tx.announcement.create({
      data: {
        tenantId,
        title: body.title,
        body: body.body,
        audience: body.audience as Prisma.InputJsonValue,
        requiresRead: body.requiresRead,
        createdById: me.personId,
        publishedAt: new Date(),
      },
    });
    await tx.announcementRead.createMany({
      data: recipients.map((personId) => ({ tenantId, announcementId: a.id, personId })),
    });
    await this.notifications.emit(
      tx,
      tenantId,
      body.requiresRead ? 'announcement.required' : 'announcement.published',
      recipients,
      { url: `/nachrichten/rundschreiben/${a.id}` },
    );
    await this.events.emit(tx, tenantId, 'announcement.published', [a.id], recipients);
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'announcement.publish',
      entity: 'announcement',
      entityId: a.id,
      meta: { recipients: recipients.length, requiresRead: body.requiresRead },
    });
    return { id: a.id, recipients: recipients.length };
  }

  private item(a: Row, readAt: Date | null, stats: AnnouncementItem['stats']): AnnouncementItem {
    return {
      id: a.id,
      title: a.title,
      body: a.body,
      author: fullName(a.createdBy),
      publishedAt: (a.publishedAt ?? a.createdAt).toISOString(),
      requiresRead: a.requiresRead,
      readAt: readAt?.toISOString() ?? null,
      audience: audienceSchema.parse(a.audience),
      stats,
    };
  }

  private async stats(tx: Tx, ids: string[]) {
    const rows = await tx.announcementRead.groupBy({
      by: ['announcementId'],
      where: { announcementId: { in: ids } },
      _count: { _all: true, readAt: true },
    });
    return new Map(
      rows.map((r) => [r.announcementId, { recipients: r._count._all, read: r._count.readAt }]),
    );
  }

  async list(
    tx: Tx,
    personId: string,
    view: 'inbox' | 'sent',
    limit: number,
    cursor?: string,
  ): Promise<{ data: AnnouncementItem[]; nextCursor: string | null }> {
    const include = { createdBy: { select: { firstName: true, lastName: true } } } as const;
    if (view === 'sent') {
      const rows = await tx.announcement.findMany({
        where: { publishedAt: { not: null } },
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include,
      });
      const page = rows.slice(0, limit);
      const stats = await this.stats(
        tx,
        page.map((a) => a.id),
      );
      return {
        data: page.map((a) => this.item(a, null, stats.get(a.id) ?? { recipients: 0, read: 0 })),
        nextCursor: rows.length > limit ? page[page.length - 1]!.id : null,
      };
    }
    const rows = await tx.announcementRead.findMany({
      where: { personId, announcement: { publishedAt: { not: null } } },
      orderBy: [{ announcement: { publishedAt: 'desc' } }, { announcementId: 'desc' }],
      take: limit + 1,
      ...(cursor
        ? { cursor: { announcementId_personId: { announcementId: cursor, personId } }, skip: 1 }
        : {}),
      include: { announcement: { include } },
    });
    const page = rows.slice(0, limit);
    return {
      data: page.map((r) => this.item(r.announcement, r.readAt, null)),
      nextCursor: rows.length > limit ? page[page.length - 1]!.announcementId : null,
    };
  }

  async detail(
    tx: Tx,
    personId: string,
    id: string,
    canSend: boolean,
  ): Promise<AnnouncementDetail> {
    const a = await tx.announcement.findUnique({
      where: { id },
      include: { createdBy: { select: { firstName: true, lastName: true } } },
    });
    const own = await tx.announcementRead.findUnique({
      where: { announcementId_personId: { announcementId: id, personId } },
    });
    if (!a || !a.publishedAt || (!own && !canSend))
      throw new NotFoundException({ title: 'Rundschreiben nicht gefunden' });
    if (!canSend)
      return { ...this.item(a, own?.readAt ?? null, null), unread: null, isRecipient: true };
    const stats = (await this.stats(tx, [id])).get(id) ?? { recipients: 0, read: 0 };
    const unread = await tx.announcementRead.findMany({
      where: { announcementId: id, readAt: null },
      select: {
        person: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            kind: true,
            roles: { select: { role: true } },
          },
        },
      },
      orderBy: [{ person: { lastName: 'asc' } }, { person: { firstName: 'asc' } }],
      take: 500,
    });
    return {
      ...this.item(a, own?.readAt ?? null, stats),
      isRecipient: own !== null,
      unread: unread.map(({ person: p }) => ({
        id: p.id,
        name: fullName(p),
        kind:
          p.kind === 'STUDENT'
            ? 'student'
            : p.kind === 'GUARDIAN'
              ? 'guardian'
              : ('staff' as const),
        context: null,
      })),
    };
  }

  async markRead(tx: Tx, personId: string, id: string) {
    const r = await tx.announcementRead.findUnique({
      where: { announcementId_personId: { announcementId: id, personId } },
    });
    if (!r) throw new NotFoundException({ title: 'Rundschreiben nicht gefunden' });
    if (r.readAt) return { readAt: r.readAt.toISOString() };
    const readAt = new Date();
    await tx.announcementRead.update({
      where: { announcementId_personId: { announcementId: id, personId } },
      data: { readAt },
    });
    return { readAt: readAt.toISOString() };
  }

  /** Erinnerung an alle, die ein Pflicht-Rundschreiben noch nicht bestätigt haben. */
  async remind(tx: Tx, tenantId: string, id: string, actorId: string | null, manual: boolean) {
    const a = await tx.announcement.findUnique({ where: { id } });
    if (!a || !a.publishedAt)
      throw new NotFoundException({ title: 'Rundschreiben nicht gefunden' });
    if (!a.requiresRead)
      throw new ConflictException({ title: 'Nur bei Rundschreiben mit Lesebestätigung' });
    if (manual && a.remindedAt && Date.now() - a.remindedAt.getTime() < REMIND_GAP_HOURS * 3600_000)
      throw new ConflictException({ title: 'Heute wurde bereits erinnert' });
    const unread = (
      await tx.announcementRead.findMany({
        where: { announcementId: id, readAt: null },
        select: { personId: true },
      })
    ).map((r) => r.personId);
    await tx.announcement.update({ where: { id }, data: { remindedAt: new Date() } });
    await this.notifications.emit(tx, tenantId, 'announcement.required', unread, {
      url: `/nachrichten/rundschreiben/${id}`,
    });
    await this.audit.record({
      tenantId,
      actorId,
      action: 'announcement.remind',
      entity: 'announcement',
      entityId: id,
      meta: { recipients: unread.length, manual },
    });
    return { reminded: unread.length };
  }

  async dailyAllTenants(): Promise<void> {
    const tenants = await this.prisma.client.tenant.findMany({ select: { id: true, slug: true } });
    for (const t of tenants) {
      try {
        const n = await this.prisma.runAsTenant(t.id, (tx) => this.daily(tx, t.id), {
          timeoutMs: 60_000,
        });
        if (n) this.logger.log(`Rundschreiben ${t.slug}: ${n} Erinnerung(en)`);
      } catch (err) {
        this.logger.error(
          `Rundschreiben ${t.slug}: ${err instanceof Error ? err.message : 'Fehler'}`,
        );
      }
    }
  }

  /** Einmalige automatische Erinnerung nach `communication.announcementReminderAfterDays`. */
  async daily(tx: Tx, tenantId: string, now = new Date()): Promise<number> {
    const t = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const days = tenantSettingsSchema.parse(t.settings).communication.announcementReminderAfterDays;
    if (days === 0) return 0;
    const due = await tx.announcement.findMany({
      where: {
        requiresRead: true,
        remindedAt: null,
        publishedAt: { lte: new Date(now.getTime() - days * 86_400_000) },
        reads: { some: { readAt: null } },
      },
      select: { id: true },
    });
    for (const a of due) await this.remind(tx, tenantId, a.id, null, false);
    return due.length;
  }
}
