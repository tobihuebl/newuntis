import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Harness } from './support/harness';

const CSV = `Familienname;Vorname;Art;Stammklasse;Schüler-Nr.;E-Mail;Geburtsdatum;Kind
Gruber;Anna;Schülerin;1A;S001;;05.03.2014;
Huber;Ben;Schüler;1A;S002;;2013-11-30;
Moser;Clara;Schüler;1B;S003;;;
Gruber;Maria;Eltern;;;maria.gruber@example.test;;S001
Bauer;Paul;Lehrer;;;paul.bauer@example.test;;
`;

describe('Personen-Import', () => {
  let h: Harness;
  let t: Awaited<ReturnType<Harness['tenantWithAdmin']>>;
  let yearId = '';

  beforeAll(async () => {
    h = await Harness.create();
    t = await h.tenantWithAdmin('imp');
    yearId = (
      await t.admin.post('/admin/school-years', {
        name: '2026/27',
        startsOn: '2026-09-07',
        endsOn: '2027-07-02',
        isCurrent: true,
      })
    ).json.id;
    await t.admin.post('/admin/classes', { schoolYearId: yearId, name: '1A' });
  });
  afterAll(async () => h.close());

  const count = (kind: string) =>
    h.owner.person.count({ where: { tenantId: t.tenant.id, kind: kind as 'STUDENT' } });

  it('Vorschau erkennt Trennzeichen und Spalten und schreibt nichts', async () => {
    const before = await h.owner.person.count({ where: { tenantId: t.tenant.id } });
    const res = await t.admin.post('/admin/import/persons?dryRun=true', { csv: CSV });
    expect(res.status).toBe(201);
    const p = res.json;
    expect(p.delimiter).toBe(';');
    expect(p.mapping).toMatchObject({
      lastName: 'Familienname',
      firstName: 'Vorname',
      role: 'Art',
      class: 'Stammklasse',
      externalId: 'Schüler-Nr.',
      email: 'E-Mail',
      birthDate: 'Geburtsdatum',
      childExternalIds: 'Kind',
    });
    expect(p.summary).toMatchObject({ total: 5, create: 4, errors: 1 });
    // Clara steht in der Klasse 1B, die es nicht gibt
    const clara = p.rows.find(
      (r: { record: { firstName: string } }) => r.record.firstName === 'Clara',
    );
    expect(clara.action).toBe('error');
    expect(clara.line).toBe(4);
    expect(clara.messages[0]).toMatch(/Klasse "1B" gibt es nicht/);
    expect(await h.owner.person.count({ where: { tenantId: t.tenant.id } })).toBe(before);
  });

  it('meldet fehlende Pflichtspalten statt zu raten, Zuordnung lässt sich nachreichen', async () => {
    const csv = 'Name;Vorname;Typ\nGruber;Anna;Schüler\n';
    const res = await t.admin.post('/admin/import/persons?dryRun=true', { csv });
    expect(res.json.unmappedRequired).toEqual([]); // "Name" = Nachname, "Typ" = Rolle werden erkannt
    const bad = await t.admin.post('/admin/import/persons?dryRun=true', {
      csv: 'Spalte1;Vorname\nx;Anna\n',
    });
    expect(bad.json.unmappedRequired).toEqual(['lastName', 'role']);
    expect(bad.json.rows).toEqual([]);
    const mapped = await t.admin.post('/admin/import/persons?dryRun=true', {
      csv: 'Spalte1;Vorname;Spalte3\nGruber;Anna;Schüler\n',
      mapping: { lastName: 'Spalte1', role: 'Spalte3' },
    });
    expect(mapped.json.unmappedRequired).toEqual([]);
    expect(mapped.json.summary.create).toBe(1);
  });

  it('prüft jede Zeile: Rolle, E-Mail, Datum, doppelte Nummer, unbekanntes Kind', async () => {
    const csv = [
      'Nachname;Vorname;Rolle;Klasse;Schülernummer;E-Mail;Geburtsdatum;Kind-Schülernummer',
      'A;Ein;Hausmeister;;;;;',
      'B;Zwei;Lehrer;;;kein-mail;;',
      'C;Drei;Schüler;1A;S900;;31.02.2014;',
      'D;Vier;Schüler;1A;S900;;;',
      ';Fuenf;Schüler;1A;S901;;;',
      'E;Sechs;Eltern;;;eltern@example.test;;S999',
    ].join('\n');
    const rows = (await t.admin.post('/admin/import/persons?dryRun=true', { csv })).json.rows as {
      line: number;
      action: string;
      messages: string[];
    }[];
    expect(rows.every((r) => r.action === 'error')).toBe(true);
    expect(rows[0]!.messages.join(' ')).toMatch(/Rolle "Hausmeister" unbekannt/);
    expect(rows[1]!.messages.join(' ')).toMatch(/E-Mail "kein-mail" ist ungültig/);
    expect(rows[2]!.messages.join(' ')).toMatch(/Geburtsdatum "31.02.2014" ungültig/);
    expect(rows[3]!.messages.join(' ')).toMatch(
      /Schülernummer S900 kommt in der Datei mehrfach vor/,
    );
    expect(rows[4]!.messages.join(' ')).toMatch(/Nachname fehlt/);
    expect(rows[5]!.messages.join(' ')).toMatch(/Kind mit Schülernummer S999 gibt es nicht/);
  });

  it('Übernehmen mit Fehlern bricht ab (422) und schreibt nichts; mit "Fehler überspringen" nur die guten Zeilen', async () => {
    const before = await h.owner.person.count({ where: { tenantId: t.tenant.id } });
    const refused = await t.admin.post('/admin/import/persons/commit', { csv: CSV });
    expect(refused.status).toBe(422);
    expect(refused.json.preview.summary.errors).toBe(1);
    expect(await h.owner.person.count({ where: { tenantId: t.tenant.id } })).toBe(before);

    const ok = await t.admin.post('/admin/import/persons/commit', { csv: CSV, skipErrors: true });
    expect(ok.status).toBe(201);
    expect(ok.json.result).toMatchObject({ created: 4, skipped: 1, linksCreated: 1 });
    expect(await count('STUDENT')).toBe(2);
    expect(
      await h.owner.person.count({
        where: { tenantId: t.tenant.id, email: 'paul.bauer@example.test' },
      }),
    ).toBe(1);
    expect(await count('GUARDIAN')).toBe(1);
  });

  it('legt Rollen, Einschreibungen und Eltern-Kind-Verknüpfung korrekt an', async () => {
    const anna = await h.owner.person.findFirstOrThrow({
      where: { tenantId: t.tenant.id, externalId: 'S001' },
      include: {
        enrollments: { include: { class: true } },
        studentLinks: { include: { guardian: true } },
        roles: true,
      },
    });
    expect(anna).toMatchObject({ firstName: 'Anna', lastName: 'Gruber', kind: 'STUDENT' });
    expect(anna.birthDate?.toISOString().slice(0, 10)).toBe('2014-03-05');
    expect(anna.enrollments.map((e) => e.class.name)).toEqual(['1A']);
    expect(anna.roles.map((r) => r.role)).toEqual(['STUDENT']);
    expect(anna.studentLinks.map((l) => l.guardian.email)).toEqual(['maria.gruber@example.test']);
    const paul = await h.owner.person.findFirstOrThrow({
      where: { tenantId: t.tenant.id, email: 'paul.bauer@example.test' },
      include: { roles: true },
    });
    expect(paul.roles.map((r) => r.role)).toEqual(['TEACHER']);
  });

  it('ist wiederholbar: gleiche Datei ergibt nur "unverändert", nichts wird doppelt angelegt', async () => {
    const res = await t.admin.post('/admin/import/persons?dryRun=true', { csv: CSV });
    expect(res.json.summary).toMatchObject({ create: 0, update: 0, errors: 1 });
    expect(res.json.summary.unchanged).toBe(4);
    await t.admin.post('/admin/import/persons/commit', { csv: CSV, skipErrors: true });
    expect(await count('STUDENT')).toBe(2);
    expect(await h.owner.guardianLink.count({ where: { tenantId: t.tenant.id } })).toBe(1);
  });

  it('aktualisiert bestehende Personen (Klassenwechsel), "fehlende Klassen anlegen" legt 1B an', async () => {
    const csv =
      'Nachname;Vorname;Rolle;Klasse;Schülernummer\nGruber;Anna;Schüler;1B;S001\nMoser;Clara;Schüler;1B;S003\n';
    const preview = await t.admin.post('/admin/import/persons?dryRun=true', {
      csv,
      createClasses: true,
    });
    expect(preview.json.summary).toMatchObject({
      create: 1,
      update: 1,
      errors: 0,
      newClasses: ['1B'],
    });
    const res = await t.admin.post('/admin/import/persons/commit', { csv, createClasses: true });
    expect(res.status).toBe(201);
    expect(res.json.result).toMatchObject({ created: 1, updated: 1, classesCreated: 1 });
    const anna = await h.owner.person.findFirstOrThrow({
      where: { tenantId: t.tenant.id, externalId: 'S001' },
      include: { enrollments: { include: { class: true }, orderBy: { fromDate: 'asc' } } },
    });
    const current = anna.enrollments.filter(
      (e) => e.toDate === null || e.toDate >= new Date(new Date().toISOString().slice(0, 10)),
    );
    expect(current.map((e) => e.class.name)).toEqual(['1B']);
    expect(anna.enrollments).toHaveLength(2);
  });

  it('sendInvitations verschickt Einladungen an Lehrer und Eltern mit E-Mail, nicht an Schüler ohne', async () => {
    const csv =
      'Nachname;Vorname;Rolle;E-Mail\nNeu;Lehrerin;Lehrer;lehrerin@example.test\nNeu;Vater;Eltern;vater@example.test\nNeu;Ohne;Lehrer;\n';
    const before = h.mails.length;
    const res = await t.admin.post('/admin/import/persons/commit', { csv, sendInvitations: true });
    expect(res.status).toBe(201);
    expect(res.json.invitations.sent).toBe(2);
    const sent = h.mails.slice(before);
    expect(sent.map((m) => m.to).sort()).toEqual(['lehrerin@example.test', 'vater@example.test']);
    expect(sent[0]!.text).toMatch(/\/einladung\?token=/);
  });

  it('akzeptiert Windows-Zeilenenden, BOM und Komma als Trennzeichen', async () => {
    const csv = '﻿Nachname,Vorname,Rolle\r\n"Müller, Maier",Max,Lehrer\r\n';
    const res = await t.admin.post('/admin/import/persons?dryRun=true', { csv });
    expect(res.json.delimiter).toBe(',');
    expect(res.json.rows[0].record.lastName).toBe('Müller, Maier');
  });

  it('ohne aktuelles Schuljahr gibt es eine klare Meldung', async () => {
    const empty = await h.tenantWithAdmin('imp0');
    const res = await empty.admin.post('/admin/import/persons?dryRun=true', {
      csv: 'Nachname;Vorname;Rolle\nA;B;Lehrer\n',
    });
    expect(res.status).toBe(400);
    expect(res.json.title).toMatch(/kein aktuelles Schuljahr/);
  });

  it('nur die Administration darf importieren', async () => {
    const pr = await h.loginFully(
      t.tenant.slug,
      (await h.createUser(t.tenant.id, [{ role: 'PRINCIPAL' }])).email,
    );
    expect((await pr.client.post('/admin/import/persons?dryRun=true', { csv: CSV })).status).toBe(
      403,
    );
    expect((await pr.client.post('/admin/import/persons/commit', { csv: CSV })).status).toBe(403);
  });

  it('Import einer Schule berührt Personen einer anderen nicht (gleiche Schülernummer, gleiche E-Mail)', async () => {
    const other = await h.tenantWithAdmin('imp2');
    await other.admin.post('/admin/school-years', {
      name: '2026/27',
      startsOn: '2026-09-07',
      endsOn: '2027-07-02',
      isCurrent: true,
    });
    const csv =
      'Nachname;Vorname;Rolle;Klasse;Schülernummer;E-Mail\nGruber;Anna;Schüler;1A;S001;\nBauer;Paul;Lehrer;;;paul.bauer@example.test\n';
    const res = await other.admin.post('/admin/import/persons?dryRun=true', {
      csv,
      createClasses: true,
    });
    expect(res.json.summary).toMatchObject({ create: 2, update: 0 }); // kein Treffer in der anderen Schule
    await other.admin.post('/admin/import/persons/commit', { csv, createClasses: true });
    expect(await h.owner.person.count({ where: { externalId: 'S001' } })).toBe(2); // je Schule eine
  });
});
