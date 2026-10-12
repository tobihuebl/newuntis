import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Tx } from '@sp/db';
import {
  can,
  messagePreview,
  type InboxCounts,
  type MessageClassOption,
  type PolicyUser,
  type Recipient,
  type RecipientKind,
  type ThreadCreateInput,
  type ThreadDetail,
  type ThreadSummary,
} from '@sp/shared';
import type { Principal } from '../../common/request';
import { AuditService } from '../audit/audit.service';
import { EventsService } from '../events/events.service';
import { NotificationsService } from '../notifications/notifications.service';
import { todayIn } from '../timetable/data';
import {
  allowedRecipients,
  currentEnrollments,
  fullName,
  guardianLinks,
  isStaffRole,
  reachable,
} from './recipients';

const MAX_MESSAGES = 200;

/** Gespräche und Nachrichten (KO-01). Rundschreiben: AnnouncementsService. */
@Injectable()
export class MessagesService {
  constructor(
    private readonly audit: AuditService,
    private readonly events: EventsService,
    private readonly notifications: NotificationsService,
  ) {}

  private async tz(tx: Tx, tenantId: string) {
    return (await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } })).timezone;
  }

  async recipients(tx: Tx, tenantId: string, user: PolicyUser, q?: string): Promise<Recipient[]> {
    const map = await allowedRecipients(tx, await this.tz(tx, tenantId), user);
    map.delete(user.personId);
    const words = (q ?? '').toLocaleLowerCase('de').split(/\s+/).filter(Boolean);
    const order: Record<RecipientKind, number> = { staff: 0, student: 1, guardian: 2 };
    return [...map.values()]
      .filter((r) => {
        const hay = `${r.name} ${r.context ?? ''}`.toLocaleLowerCase('de');
        return words.every((w) => hay.includes(w));
      })
      .sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name, 'de'))
      .slice(0, 30);
  }

  /** Klassen, an deren Eltern bzw. Schüler:innen die Person schreiben darf. */
  async classOptions(tx: Tx, user: PolicyUser): Promise<MessageClassOption[]> {
    const all = user.roles.some((r) => r === 'PRINCIPAL' || r === 'ADMIN');
    const ids = [...new Set([...(user.teachesClassIds ?? []), ...(user.homeroomClassIds ?? [])])];
    if (!all && ids.length === 0) return [];
    const classes = await tx.schoolClass.findMany({
      where: all ? { schoolYear: { isCurrent: true } } : { id: { in: ids } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return classes;
  }

  async create(
    tx: Tx,
    tenantId: string,
    me: Principal,
    user: PolicyUser,
    body: ThreadCreateInput,
  ): Promise<{ threadIds: string[]; skipped: number }> {
    const tz = await this.tz(tx, tenantId);
    const allowed = await allowedRecipients(tx, tz, user);
    const now = new Date();
    const groups: { personIds: string[]; aboutStudentId: string | null; classId: string | null }[] =
      [];
    let skipped = 0;

    if (body.to.kind === 'persons') {
      const ids = [...new Set(body.to.personIds)].filter((p) => p !== me.personId);
      if (ids.length === 0)
        throw new BadRequestException({ title: 'Bitte Empfänger:innen wählen' });
      const unknown = ids.filter((p) => !allowed.has(p));
      if (unknown.length)
        throw new ForbiddenException({ title: 'An diese Person dürfen Sie nicht schreiben' });
      const recipientsAreTeachers = ids.every((p) => allowed.get(p)!.kind === 'staff');
      if (!can(user, 'message.send', { recipientsAreTeachers }))
        throw new ForbiddenException({ title: 'Nur Nachrichten an Lehrkräfte möglich' });
      groups.push({ personIds: ids, aboutStudentId: null, classId: null });
    } else {
      const { classId, audience } = body.to;
      const options = await this.classOptions(tx, user);
      if (!options.some((c) => c.id === classId))
        throw new ForbiddenException({ title: 'An diese Klasse dürfen Sie nicht schreiben' });
      const day = todayIn(tz);
      const students = (await currentEnrollments(tx, { classId: { in: [classId] } }, day)).map(
        (e) => e.studentId,
      );
      if (audience === 'students') {
        const ok = await tx.person.findMany({
          where: { ...reachable, id: { in: students } },
          select: { id: true },
        });
        skipped = students.length - ok.length;
        for (const s of ok) groups.push({ personIds: [s.id], aboutStudentId: s.id, classId });
      } else {
        const links = await guardianLinks(tx, students, day);
        const ok = new Set(
          (
            await tx.person.findMany({
              where: { ...reachable, id: { in: links.map((l) => l.guardianId) } },
              select: { id: true },
            })
          ).map((p) => p.id),
        );
        for (const s of students) {
          const gs = [
            ...new Set(
              links
                .filter((l) => l.studentId === s && ok.has(l.guardianId))
                .map((l) => l.guardianId),
            ),
          ].filter((g) => g !== me.personId);
          if (gs.length === 0) skipped++;
          else groups.push({ personIds: gs, aboutStudentId: s, classId });
        }
      }
      if (groups.length === 0)
        throw new BadRequestException({ title: 'In dieser Klasse ist niemand erreichbar' });
    }

    const threadIds: string[] = [];
    for (const g of groups) {
      const thread = await tx.thread.create({
        data: {
          tenantId,
          subject: body.subject,
          createdById: me.personId,
          aboutStudentId: g.aboutStudentId,
          classId: g.classId,
          lastMessageAt: now,
          participants: {
            create: [
              { tenantId, personId: me.personId, lastReadAt: now },
              ...g.personIds.map((personId) => ({ tenantId, personId })),
            ],
          },
          messages: {
            create: { tenantId, senderId: me.personId, body: body.body, createdAt: now },
          },
        },
      });
      threadIds.push(thread.id);
    }
    const recipients = [...new Set(groups.flatMap((g) => g.personIds))];
    await this.notifications.emit(tx, tenantId, 'message.new', recipients, {
      url: threadIds.length === 1 ? `/nachrichten/${threadIds[0]}` : '/nachrichten',
    });
    await this.events.emit(tx, tenantId, 'message.new', threadIds, [...recipients, me.personId]);
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'thread.create',
      entity: 'thread',
      entityId: threadIds[0] ?? null,
      meta: { threads: threadIds.length, recipients: recipients.length, kind: body.to.kind },
    });
    return { threadIds, skipped };
  }

  private async participant(tx: Tx, threadId: string, personId: string) {
    const p = await tx.threadParticipant.findUnique({
      where: { threadId_personId: { threadId, personId } },
    });
    if (!p) throw new NotFoundException({ title: 'Gespräch nicht gefunden' });
    return p;
  }

  async reply(tx: Tx, tenantId: string, me: Principal, threadId: string, body: string) {
    await this.participant(tx, threadId, me.personId);
    const now = new Date();
    const msg = await tx.message.create({
      data: { tenantId, threadId, senderId: me.personId, body, createdAt: now },
    });
    await tx.thread.update({ where: { id: threadId }, data: { lastMessageAt: now } });
    await tx.threadParticipant.update({
      where: { threadId_personId: { threadId, personId: me.personId } },
      data: { lastReadAt: now },
    });
    const others = (
      await tx.threadParticipant.findMany({
        where: { threadId, personId: { not: me.personId } },
        select: { personId: true },
      })
    ).map((p) => p.personId);
    await this.notifications.emit(tx, tenantId, 'message.new', others, {
      url: `/nachrichten/${threadId}`,
    });
    await this.events.emit(tx, tenantId, 'message.new', [threadId], [...others, me.personId]);
    return { id: msg.id, at: now.toISOString() };
  }

  async markRead(tx: Tx, threadId: string, personId: string) {
    await this.participant(tx, threadId, personId);
    await tx.threadParticipant.update({
      where: { threadId_personId: { threadId, personId } },
      data: { lastReadAt: new Date() },
    });
  }

  /** Ungelesene Nachrichten je Gespräch (ohne eigene). */
  private async unreadByThread(
    tx: Tx,
    personId: string,
    threadIds?: string[],
  ): Promise<Map<string, number>> {
    const rows = await tx.$queryRaw<{ threadId: string; n: bigint }[]>`
      SELECT m."threadId", count(*) AS n
      FROM "Message" m
      JOIN "ThreadParticipant" p ON p."threadId" = m."threadId" AND p."personId" = ${personId}
      WHERE m."senderId" <> ${personId}
        AND (p."lastReadAt" IS NULL OR m."createdAt" > p."lastReadAt")
        ${threadIds ? Prisma.sql`AND m."threadId" IN (${Prisma.join(threadIds.length ? threadIds : [''])})` : Prisma.empty}
      GROUP BY m."threadId"`;
    return new Map(rows.map((r) => [r.threadId, Number(r.n)]));
  }

  async list(
    tx: Tx,
    personId: string,
    limit: number,
    cursor?: string,
  ): Promise<{ data: ThreadSummary[]; nextCursor: string | null }> {
    const rows = await tx.thread.findMany({
      where: { participants: { some: { personId } } },
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        participants: {
          select: { person: { select: { id: true, firstName: true, lastName: true } } },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            body: true,
            createdAt: true,
            senderId: true,
            sender: { select: { firstName: true, lastName: true } },
          },
        },
        aboutStudent: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    const page = rows.slice(0, limit);
    const unread = await this.unreadByThread(
      tx,
      personId,
      page.map((t) => t.id),
    );
    const classNames = await this.classNames(
      tx,
      page.flatMap((t) => (t.classId ? [t.classId] : [])),
    );
    return {
      data: page.map((t) => {
        const others = t.participants.map((p) => p.person).filter((p) => p.id !== personId);
        const last = t.messages[0];
        return {
          id: t.id,
          subject: t.subject,
          participants: others.slice(0, 4).map((p) => ({ id: p.id, name: fullName(p) })),
          participantCount: others.length,
          aboutStudent: t.aboutStudent
            ? { id: t.aboutStudent.id, name: fullName(t.aboutStudent) }
            : null,
          className: t.classId ? (classNames.get(t.classId) ?? null) : null,
          lastMessage: last
            ? {
                senderName: fullName(last.sender),
                preview: messagePreview(last.body),
                at: last.createdAt.toISOString(),
                own: last.senderId === personId,
              }
            : null,
          unread: unread.get(t.id) ?? 0,
        };
      }),
      nextCursor: rows.length > limit ? page[page.length - 1]!.id : null,
    };
  }

  private async classNames(tx: Tx, ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await tx.schoolClass.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((c) => [c.id, c.name]));
  }

  async detail(tx: Tx, personId: string, threadId: string): Promise<ThreadDetail> {
    await this.participant(tx, threadId, personId);
    const t = await tx.thread.findUniqueOrThrow({
      where: { id: threadId },
      include: {
        participants: {
          select: {
            person: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                kind: true,
                anonymizedAt: true,
                roles: { select: { role: true } },
              },
            },
          },
        },
        aboutStudent: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    const messages = await tx.message.findMany({
      where: { threadId },
      orderBy: { createdAt: 'desc' },
      take: MAX_MESSAGES,
      select: {
        id: true,
        body: true,
        createdAt: true,
        senderId: true,
        sender: { select: { firstName: true, lastName: true } },
      },
    });
    const kindOf = (p: { kind: string; roles: { role: string }[] }): RecipientKind =>
      p.roles.some((r) => isStaffRole(r.role as never))
        ? 'staff'
        : p.kind === 'STUDENT'
          ? 'student'
          : p.kind === 'GUARDIAN'
            ? 'guardian'
            : 'staff';
    const others = t.participants.map((p) => p.person).filter((p) => p.id !== personId);
    const classNames = await this.classNames(tx, t.classId ? [t.classId] : []);
    return {
      id: t.id,
      subject: t.subject,
      participants: t.participants.map((p) => ({
        id: p.person.id,
        name: fullName(p.person),
        kind: kindOf(p.person),
      })),
      aboutStudent: t.aboutStudent
        ? { id: t.aboutStudent.id, name: fullName(t.aboutStudent) }
        : null,
      className: t.classId ? (classNames.get(t.classId) ?? null) : null,
      messages: messages.reverse().map((m) => ({
        id: m.id,
        senderId: m.senderId,
        senderName: fullName(m.sender),
        body: m.body,
        at: m.createdAt.toISOString(),
        own: m.senderId === personId,
      })),
      // Antworten nur, solange noch jemand anderes im Gespräch erreichbar ist
      canReply: others.some((p) => p.anonymizedAt === null),
    };
  }

  /** Ungelesene Nachrichten und Rundschreiben für Heute und die Navigation. */
  async inboxCounts(tx: Tx, personId: string): Promise<InboxCounts> {
    const unread = await this.unreadByThread(tx, personId);
    const announcements = await tx.announcementRead.findMany({
      where: { personId, readAt: null, announcement: { publishedAt: { not: null } } },
      select: { announcement: { select: { requiresRead: true } } },
    });
    return {
      messages: [...unread.values()].reduce((a, b) => a + b, 0),
      announcements: announcements.length,
      required: announcements.filter((a) => a.announcement.requiresRead).length,
    };
  }
}
