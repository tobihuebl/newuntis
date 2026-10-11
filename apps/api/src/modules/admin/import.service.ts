import { randomUUID } from 'node:crypto';
import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import {
  emailSchema,
  type ImportField,
  type ImportInput,
  type ImportPreview,
  type ImportRowResult,
  type PersonKindName,
} from '@sp/shared';
import type { Tx } from '@sp/db';
import { bad, isoDate, toDate, today, yesterday } from './util';
import { mapHeaders, nameKey, normalizeKey, parseCsv, parseDate, parseKind, splitIds } from './csv';

interface Existing {
  id: string;
  kind: PersonKindName;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  email: string | null;
  externalId: string | null;
  className: string | null;
}

export interface ParsedRow {
  line: number;
  action: 'create' | 'update' | 'unchanged' | 'error';
  messages: string[];
  data: {
    firstName: string;
    lastName: string;
    kind: 'STUDENT' | 'TEACHER' | 'GUARDIAN' | null;
    className: string | null;
    email: string | null;
    externalId: string | null;
    birthDate: string | null;
  };
  existingId: string | null;
  childExternalIds: string[];
}

export interface ImportContext {
  schoolYearId: string;
  classes: Map<string, { id: string; name: string }>; // Schlüssel: normalisierter Klassenname
  existing: Existing[];
  /** Aktive Eltern-Kind-Verknüpfungen als "elternId|kindId". */
  links: Set<string>;
}

const HINT = 'Hinweis: ';

export async function loadContext(tx: Tx): Promise<ImportContext> {
  const year = await tx.schoolYear.findFirst({ where: { isCurrent: true }, select: { id: true } });
  if (!year)
    bad(
      'Es gibt kein aktuelles Schuljahr. Bitte zuerst ein Schuljahr anlegen und als aktuell markieren.',
    );
  const now = today();
  const [classes, persons, links] = await Promise.all([
    tx.schoolClass.findMany({ where: { schoolYearId: year.id }, select: { id: true, name: true } }),
    tx.person.findMany({
      where: { anonymizedAt: null },
      select: {
        id: true,
        kind: true,
        firstName: true,
        lastName: true,
        birthDate: true,
        email: true,
        externalId: true,
        enrollments: {
          where: { OR: [{ toDate: null }, { toDate: { gte: now } }] },
          select: { class: { select: { name: true } } },
        },
      },
    }),
    tx.guardianLink.findMany({
      where: { OR: [{ validTo: null }, { validTo: { gte: now } }] },
      select: { guardianId: true, studentId: true },
    }),
  ]);
  return {
    schoolYearId: year.id,
    links: new Set(links.map((l) => `${l.guardianId}|${l.studentId}`)),
    classes: new Map(classes.map((c) => [normalizeKey(c.name), c])),
    existing: persons
      .filter((p) => p.kind !== 'STAFF')
      .map((p) => ({
        id: p.id,
        kind: p.kind,
        firstName: p.firstName,
        lastName: p.lastName,
        birthDate: isoDate(p.birthDate),
        email: p.email,
        externalId: p.externalId,
        className: p.enrollments[0]?.class.name ?? null,
      })),
  };
}

/** Prüft die Datei und liefert je Zeile, was beim Übernehmen passieren würde. Schreibt nichts. */
export function analyze(
  input: Pick<ImportInput, 'csv' | 'mapping' | 'delimiter' | 'createClasses'>,
  ctx: ImportContext,
): { preview: ImportPreview; rows: ParsedRow[] } {
  const csv = parseCsv(input.csv, input.delimiter);
  const mapping = mapHeaders(csv.headers, input.mapping ?? {});
  const unmappedRequired = (['firstName', 'lastName', 'role'] as ImportField[]).filter(
    (f) => !mapping[f],
  );
  const empty = {
    total: 0,
    create: 0,
    update: 0,
    unchanged: 0,
    errors: 0,
    newClasses: [] as string[],
  };
  if (unmappedRequired.length > 0) {
    return {
      preview: {
        delimiter: csv.delimiter,
        headers: csv.headers,
        mapping,
        unmappedRequired,
        summary: empty,
        rows: [],
      },
      rows: [],
    };
  }

  const col = (cells: string[], field: ImportField): string => {
    const header = mapping[field];
    const idx = header ? csv.headers.indexOf(header) : -1;
    return idx >= 0 ? (cells[idx] ?? '').trim() : '';
  };

  const byExternalId = new Map(
    ctx.existing.filter((p) => p.externalId).map((p) => [p.externalId!, p]),
  );
  const byEmail = (kind: string) =>
    new Map(
      ctx.existing
        .filter((p) => p.kind === kind && p.email)
        .map((p) => [p.email!.toLowerCase(), p]),
    );
  const teacherByEmail = byEmail('TEACHER');
  const guardianByEmail = byEmail('GUARDIAN');
  const byName = (kind: string) => {
    const m = new Map<string, Existing[]>();
    for (const p of ctx.existing.filter((x) => x.kind === kind))
      m.set(nameKey(p.firstName, p.lastName), [
        ...(m.get(nameKey(p.firstName, p.lastName)) ?? []),
        p,
      ]);
    return m;
  };
  const teacherByName = byName('TEACHER');
  const guardianByName = byName('GUARDIAN');
  const studentByNameBirth = new Map(
    ctx.existing
      .filter((p) => p.kind === 'STUDENT' && p.birthDate)
      .map((p) => [`${nameKey(p.firstName, p.lastName)}|${p.birthDate}`, p]),
  );

  const seenExternal = new Set<string>();
  const seenEmail = new Set<string>();
  const fileStudentIds = new Set<string>(); // Schülernummern, die in dieser Datei vorkommen (Eltern dürfen vor oder nach dem Kind stehen)
  for (const r of csv.rows) {
    if (parseKind(col(r.cells, 'role')) === 'STUDENT' && col(r.cells, 'externalId'))
      fileStudentIds.add(col(r.cells, 'externalId'));
  }
  const newClasses = new Map<string, string>();

  const rows: ParsedRow[] = csv.rows.map((r) => {
    const errors: string[] = [];
    const notes: string[] = [];
    const firstName = col(r.cells, 'firstName');
    const lastName = col(r.cells, 'lastName');
    const rawRole = col(r.cells, 'role');
    const kind = parseKind(rawRole);
    const rawEmail = col(r.cells, 'email');
    const className = col(r.cells, 'class') || null;
    const externalId = col(r.cells, 'externalId') || null;
    const rawBirth = col(r.cells, 'birthDate');
    const childIds = splitIds(col(r.cells, 'childExternalIds'));

    if (!firstName) errors.push('Vorname fehlt');
    if (!lastName) errors.push('Nachname fehlt');
    if (!rawRole) errors.push('Rolle fehlt');
    else if (!kind) errors.push(`Rolle "${rawRole}" unbekannt (erlaubt: Schüler, Lehrer, Eltern)`);
    let email: string | null = null;
    if (rawEmail) {
      const parsed = emailSchema.safeParse(rawEmail);
      if (parsed.success) email = parsed.data;
      else errors.push(`E-Mail "${rawEmail}" ist ungültig`);
    }
    let birthDate: string | null = null;
    if (rawBirth) {
      birthDate = parseDate(rawBirth);
      if (!birthDate)
        errors.push(`Geburtsdatum "${rawBirth}" ungültig (erlaubt: TT.MM.JJJJ oder JJJJ-MM-TT)`);
    }

    // Klasse: nur für Schüler relevant
    if (kind === 'STUDENT') {
      if (!className)
        notes.push(`${HINT}keine Klasse angegeben, die Person wird keiner Klasse zugeordnet`);
      else if (!ctx.classes.has(normalizeKey(className))) {
        if (input.createClasses) newClasses.set(normalizeKey(className), className);
        else
          errors.push(
            `Klasse "${className}" gibt es nicht (Option "fehlende Klassen anlegen" aktivieren oder Klasse vorher anlegen)`,
          );
      }
    } else if (className) notes.push(`${HINT}Klasse wird bei dieser Rolle ignoriert`);
    if ((kind === 'TEACHER' || kind === 'GUARDIAN') && !email)
      notes.push(`${HINT}ohne E-Mail ist keine Einladung möglich`);

    // Doppelte Einträge in der Datei
    if (kind === 'STUDENT' && externalId) {
      if (seenExternal.has(externalId))
        errors.push(`Schülernummer ${externalId} kommt in der Datei mehrfach vor`);
      seenExternal.add(externalId);
    }
    if ((kind === 'TEACHER' || kind === 'GUARDIAN') && email) {
      const key = `${kind}|${email.toLowerCase()}`;
      if (seenEmail.has(key)) errors.push(`E-Mail ${email} kommt in der Datei mehrfach vor`);
      seenEmail.add(key);
    }

    // Kinder der Eltern
    if (kind === 'GUARDIAN') {
      if (childIds.length === 0)
        notes.push(`${HINT}kein Kind angegeben, die Verknüpfung muss später erfolgen`);
      for (const id of childIds) {
        const known = byExternalId.get(id);
        if (!(known?.kind === 'STUDENT') && !fileStudentIds.has(id))
          errors.push(`Kind mit Schülernummer ${id} gibt es nicht`);
      }
    }

    // Zuordnung zu einer vorhandenen Person
    let match: Existing | undefined;
    if (kind === 'STUDENT') {
      if (externalId) match = byExternalId.get(externalId);
      if (match && match.kind !== 'STUDENT')
        errors.push(`Schülernummer ${externalId} gehört zu einer anderen Personenart`);
      if (!match && birthDate)
        match = studentByNameBirth.get(`${nameKey(firstName, lastName)}|${birthDate}`);
    } else if (kind === 'TEACHER' || kind === 'GUARDIAN') {
      const emails = kind === 'TEACHER' ? teacherByEmail : guardianByEmail;
      const names = kind === 'TEACHER' ? teacherByName : guardianByName;
      if (email) match = emails.get(email.toLowerCase());
      if (!match && !email) {
        const candidates = names.get(nameKey(firstName, lastName)) ?? [];
        if (candidates.length === 1) match = candidates[0];
        else if (candidates.length > 1)
          errors.push(
            `Mehrere vorhandene Personen heißen ${firstName} ${lastName}; bitte E-Mail angeben`,
          );
      }
    }

    let action: ParsedRow['action'] = 'create';
    if (errors.length > 0) action = 'error';
    else if (match) {
      const same =
        match.firstName === firstName &&
        match.lastName === lastName &&
        (!email || match.email?.toLowerCase() === email.toLowerCase()) &&
        (!birthDate || match.birthDate === birthDate) &&
        (kind !== 'STUDENT' ||
          !className ||
          normalizeKey(match.className ?? '') === normalizeKey(className)) &&
        // Eltern: nur unverändert, wenn alle genannten Kinder schon verknüpft sind
        (kind !== 'GUARDIAN' ||
          childIds.every((id) => ctx.links.has(`${match.id}|${byExternalId.get(id)?.id}`)));
      action = same ? 'unchanged' : 'update';
    }
    return {
      line: r.line,
      action,
      messages: [...errors, ...notes],
      data: { firstName, lastName, kind, className, email, externalId, birthDate },
      existingId: match?.id ?? null,
      childExternalIds: childIds,
    };
  });

  const summary = {
    total: rows.length,
    create: rows.filter((r) => r.action === 'create').length,
    update: rows.filter((r) => r.action === 'update').length,
    unchanged: rows.filter((r) => r.action === 'unchanged').length,
    errors: rows.filter((r) => r.action === 'error').length,
    newClasses: [...newClasses.values()].sort(),
  };
  const view: ImportRowResult[] = rows.map((r) => ({
    line: r.line,
    action: r.action,
    messages: r.messages,
    record: {
      firstName: r.data.firstName,
      lastName: r.data.lastName,
      kind: r.data.kind,
      className: r.data.className,
      email: r.data.email,
      externalId: r.data.externalId,
    },
  }));
  return {
    preview: {
      delimiter: csv.delimiter,
      headers: csv.headers,
      mapping,
      unmappedRequired,
      summary,
      rows: view,
    },
    rows,
  };
}

export interface CommitResult {
  created: number;
  updated: number;
  skipped: number;
  classesCreated: number;
  linksCreated: number;
  /** Neu angelegte oder geänderte Personen mit E-Mail (für Einladungen). */
  invitablePersonIds: string[];
}

/** Schreibt die geprüften Zeilen. Läuft in der Transaktion des Aufrufers; alles oder nichts. */
export async function commit(
  tx: Tx,
  tenantId: string,
  ctx: ImportContext,
  rows: ParsedRow[],
  createClasses: boolean,
): Promise<CommitResult> {
  const now = today();
  const ok = rows.filter((r) => r.action === 'create' || r.action === 'update');
  const result: CommitResult = {
    created: 0,
    updated: 0,
    skipped: rows.length - ok.length,
    classesCreated: 0,
    linksCreated: 0,
    invitablePersonIds: [],
  };

  // fehlende Klassen anlegen
  const classes = new Map(ctx.classes);
  if (createClasses) {
    for (const r of ok) {
      const name = r.data.kind === 'STUDENT' ? r.data.className : null;
      if (name && !classes.has(normalizeKey(name))) {
        const c = await tx.schoolClass.create({
          data: { tenantId, schoolYearId: ctx.schoolYearId, name },
        });
        classes.set(normalizeKey(name), { id: c.id, name });
        result.classesCreated++;
      }
    }
  }

  // Schülernummer -> Personen-ID (vorhandene und neu angelegte)
  const studentIdByExternal = new Map(
    ctx.existing
      .filter((p) => p.kind === 'STUDENT' && p.externalId)
      .map((p) => [p.externalId!, p.id]),
  );
  const idByLine = new Map<number, string>();
  const creates: ParsedRow[] = [];
  for (const r of ok) {
    if (r.existingId) idByLine.set(r.line, r.existingId);
    else {
      const id = randomUUID();
      idByLine.set(r.line, id);
      if (r.data.kind === 'STUDENT' && r.data.externalId)
        studentIdByExternal.set(r.data.externalId, id);
      creates.push(r);
    }
  }

  if (creates.length) {
    await tx.person.createMany({
      data: creates.map((r) => ({
        id: idByLine.get(r.line)!,
        tenantId,
        kind: r.data.kind!,
        firstName: r.data.firstName,
        lastName: r.data.lastName,
        birthDate: r.data.birthDate ? toDate(r.data.birthDate) : null,
        externalId: r.data.kind === 'STUDENT' ? r.data.externalId : null,
        email: r.data.email,
      })),
    });
    await tx.roleAssignment.createMany({
      data: creates.map((r) => ({ tenantId, personId: idByLine.get(r.line)!, role: r.data.kind! })),
    });
    const enrollments = creates
      .filter((r) => r.data.kind === 'STUDENT' && r.data.className)
      .map((r) => ({
        tenantId,
        studentId: idByLine.get(r.line)!,
        classId: classes.get(normalizeKey(r.data.className!))!.id,
        fromDate: now,
      }));
    if (enrollments.length) await tx.enrollment.createMany({ data: enrollments });
    result.created = creates.length;
  }

  for (const r of ok.filter((x) => x.existingId && x.action === 'update')) {
    const id = r.existingId!;
    await tx.person.update({
      where: { id },
      data: {
        firstName: r.data.firstName,
        lastName: r.data.lastName,
        ...(r.data.birthDate ? { birthDate: toDate(r.data.birthDate) } : {}),
        ...(r.data.email ? { email: r.data.email } : {}),
        ...(r.data.kind === 'STUDENT' && r.data.externalId
          ? { externalId: r.data.externalId }
          : {}),
      },
    });
    if (r.data.kind === 'STUDENT' && r.data.className) {
      const target = classes.get(normalizeKey(r.data.className))!.id;
      const current = await tx.enrollment.findFirst({
        where: { studentId: id, OR: [{ toDate: null }, { toDate: { gte: now } }] },
      });
      if (current?.classId !== target) {
        if (current)
          await tx.enrollment.update({ where: { id: current.id }, data: { toDate: yesterday() } });
        await tx.enrollment.create({
          data: { tenantId, studentId: id, classId: target, fromDate: now },
        });
      }
    }
    result.updated++;
  }

  // Eltern-Kind-Verknüpfungen (nur neue)
  const wanted: { guardianId: string; studentId: string }[] = [];
  for (const r of ok.filter((x) => x.data.kind === 'GUARDIAN')) {
    for (const child of r.childExternalIds) {
      const studentId = studentIdByExternal.get(child);
      if (studentId) wanted.push({ guardianId: idByLine.get(r.line)!, studentId });
    }
  }
  if (wanted.length) {
    const have = await tx.guardianLink.findMany({
      where: {
        guardianId: { in: [...new Set(wanted.map((w) => w.guardianId))] },
        OR: [{ validTo: null }, { validTo: { gte: now } }],
      },
      select: { guardianId: true, studentId: true },
    });
    const haveKeys = new Set(have.map((h) => `${h.guardianId}|${h.studentId}`));
    const fresh = wanted.filter(
      (w, i) =>
        !haveKeys.has(`${w.guardianId}|${w.studentId}`) &&
        wanted.findIndex((x) => x.guardianId === w.guardianId && x.studentId === w.studentId) === i,
    );
    if (fresh.length)
      await tx.guardianLink.createMany({
        data: fresh.map((w) => ({ tenantId, ...w, validFrom: now })),
      });
    result.linksCreated = fresh.length;
  }

  result.invitablePersonIds = ok
    .filter((r) => r.data.email && r.data.kind !== 'STUDENT')
    .map((r) => idByLine.get(r.line)!);
  return result;
}

@Injectable()
export class ImportService {
  preview(input: ImportInput, ctx: ImportContext): ImportPreview {
    return analyze(input, ctx).preview;
  }

  /** Übernimmt die Datei: bei Fehlern nur mit `skipErrors`, sonst 422 samt Vorschau. */
  async apply(tx: Tx, tenantId: string, input: ImportInput) {
    const ctx = await loadContext(tx);
    const { preview, rows } = analyze(input, ctx);
    if (preview.unmappedRequired.length > 0)
      throw new UnprocessableEntityException({ title: 'Pflichtspalten fehlen', preview });
    if (preview.summary.errors > 0 && !input.skipErrors)
      throw new UnprocessableEntityException({ title: 'Die Datei enthält Fehler', preview });
    const result = await commit(tx, tenantId, ctx, rows, input.createClasses);
    return { preview, result };
  }
}
