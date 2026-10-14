import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { BRAND, DESIGN_COLORS, type PersonExport } from '@sp/shared';
import { DateTime } from 'luxon';

/**
 * Datenauskunft als PDF (Spec Abschnitt 13), gleiche Gliederung wie der JSON-Export.
 * Standardschrift Helvetica (im PDF-Betrachter vorhanden, keine externen Schriften).
 */
const c = DESIGN_COLORS.light;
const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: 'Helvetica', color: c.ink },
  h1: { fontSize: 16, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  meta: { color: c['ink-muted'], marginBottom: 12 },
  h2: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 12, marginBottom: 4 },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: c.line,
    paddingVertical: 2,
  },
  cell: { flex: 1, paddingRight: 4 },
  label: { width: 120, color: c['ink-muted'] },
  empty: { color: c['ink-subtle'] },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 36,
    right: 36,
    color: c['ink-subtle'],
    fontSize: 8,
  },
});

const when = (iso: string | null, tz: string) =>
  iso ? DateTime.fromISO(iso).setZone(tz).toFormat('dd.LL.yyyy HH:mm') : '–';
const day = (d: string | null) => (d ? DateTime.fromISO(d).toFormat('dd.LL.yyyy') : '–');

function Table({ head, rows }: { head: string[]; rows: (string | number | null)[][] }) {
  if (rows.length === 0) return <Text style={s.empty}>Keine Einträge.</Text>;
  return (
    <View>
      <View style={s.row} fixed>
        {head.map((h) => (
          <Text key={h} style={[s.cell, { fontFamily: 'Helvetica-Bold' }]}>
            {h}
          </Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={i} style={s.row} wrap={false}>
          {r.map((c, j) => (
            <Text key={j} style={s.cell}>
              {c === null || c === '' ? '–' : String(c)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={{ flexDirection: 'row', marginBottom: 2 }}>
      <Text style={s.label}>{label}</Text>
      <Text>{value ?? '–'}</Text>
    </View>
  );
}

function ExportDocument({ d, tz }: { d: PersonExport; tz: string }) {
  return (
    <Document title={`Datenauskunft ${d.person.firstName} ${d.person.lastName}`} language="de-AT">
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>Datenauskunft</Text>
        <Text style={s.meta}>
          {d.school} · erstellt am {when(d.generatedAt, tz)} · Art. 15 DSGVO
        </Text>

        <Text style={s.h2}>Person</Text>
        <Field label="Name" value={`${d.person.firstName} ${d.person.lastName}`} />
        <Field label="Art" value={d.person.kind} />
        <Field label="Geburtsdatum" value={day(d.person.birthDate)} />
        <Field label="Schülernummer" value={d.person.externalId} />
        <Field label="Kontakt-E-Mail" value={d.person.email} />
        <Field label="Verarbeitung eingeschränkt" value={d.person.restricted ? 'ja' : 'nein'} />

        <Text style={s.h2}>Konto</Text>
        {d.account ? (
          <View>
            <Field label="Anmelde-E-Mail" value={d.account.email} />
            <Field label="Zwei-Faktor" value={d.account.twoFactor ? 'aktiv' : 'nicht aktiv'} />
            <Field label="Letzte Anmeldung" value={when(d.account.lastLoginAt, tz)} />
            <Field label="Angelegt" value={when(d.account.createdAt, tz)} />
          </View>
        ) : (
          <Text style={s.empty}>Kein Konto.</Text>
        )}

        <Text style={s.h2}>Rollen und Klassen</Text>
        <Table head={['Rolle', 'Klasse']} rows={d.roles.map((r) => [r.role, r.className])} />
        <Table
          head={['Klasse', 'von', 'bis']}
          rows={d.enrollments.map((e) => [e.className, day(e.fromDate), day(e.toDate)])}
        />

        <Text style={s.h2}>Verknüpfungen</Text>
        <Table
          head={['Kind', 'von', 'bis']}
          rows={d.guardianOf.map((g) => [g.name, day(g.validFrom), day(g.validTo)])}
        />
        <Table
          head={['Erziehungsberechtigte', 'von', 'bis']}
          rows={d.guardians.map((g) => [g.name, day(g.validFrom), day(g.validTo)])}
        />

        <Text style={s.h2}>Anwesenheit</Text>
        <Table
          head={['Datum', 'Fach', 'Status', 'Minuten verspätet']}
          rows={d.attendance.map((a) => [day(a.date), a.subject, a.status, a.lateMinutes])}
        />

        <Text style={s.h2}>Noten</Text>
        <Table
          head={['Datum', 'Fach', 'Leistung', 'Note', 'Anmerkung']}
          rows={d.grades.map((g) => [day(g.date), g.subject, g.title, g.value, g.comment])}
        />

        <Text style={s.h2}>Vermerke im Klassenbuch</Text>
        <Table
          head={['Datum', 'Fach', 'Vermerk']}
          rows={d.remarks.map((r) => [day(r.date), r.subject, r.text])}
        />

        <Text style={s.h2}>Fehlzeiten</Text>
        <Table
          head={['von', 'bis', 'Status', 'Grund', 'Anmerkung', 'Kommentar', 'Anhang']}
          rows={d.absences.map((a) => [
            when(a.fromAt, tz),
            when(a.toAt, tz),
            a.status,
            a.reasonCode,
            a.reason,
            a.reviewComment,
            a.hasAttachment ? 'ja' : 'nein',
          ])}
        />

        <Text style={s.h2}>Abwesenheiten als Lehrkraft</Text>
        <Table
          head={['von', 'bis', 'Art', 'Notiz']}
          rows={d.teacherAbsences.map((a) => [
            when(a.fromAt, tz),
            when(a.toAt, tz),
            a.kind,
            a.note,
          ])}
        />

        <Text style={s.h2}>Gesendete Nachrichten</Text>
        <Table
          head={['Gespräch', 'Zeit', 'Text']}
          rows={d.messages.map((m) => [m.thread, when(m.at, tz), m.body])}
        />

        <Text style={s.h2}>Rundschreiben</Text>
        <Table
          head={['Titel', 'gelesen']}
          rows={d.announcementsRead.map((a) => [a.title, when(a.readAt, tz)])}
        />

        <Text style={s.h2}>Benachrichtigungen</Text>
        <Table
          head={['Art', 'Zeit', 'gelesen']}
          rows={d.notifications.map((n) => [n.type, when(n.createdAt, tz), when(n.readAt, tz)])}
        />
        <Table
          head={['Einstellung', 'Kanal', 'aktiv']}
          rows={d.preferences.map((p) => [p.type, p.channel, p.enabled ? 'ja' : 'nein'])}
        />

        <Text style={s.h2}>Geräte</Text>
        <Table
          head={['Gerät', 'zuletzt aktiv']}
          rows={d.devices.map((x) => [x.userAgent, when(x.lastSeenAt, tz)])}
        />

        <Text style={s.h2}>Einwilligungen</Text>
        <Table
          head={['Art', 'Version', 'Zeit']}
          rows={d.consents.map((c) => [c.kind, c.version, when(c.acceptedAt, tz)])}
        />

        <Text style={s.h2}>Protokoll eigener Aktionen</Text>
        <Table
          head={['Zeit', 'Aktion', 'Bereich']}
          rows={d.auditTrail.map((a) => [when(a.at, tz), a.action, a.entity])}
        />

        <Text
          style={s.footer}
          render={({ pageNumber, totalPages }) =>
            `${BRAND.name} · Seite ${pageNumber} von ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}

export function renderExportPdf(d: PersonExport, tz: string): Promise<Buffer> {
  return renderToBuffer(<ExportDocument d={d} tz={tz} />);
}
