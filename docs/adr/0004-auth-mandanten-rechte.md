# ADR 0004: Mandanten, Sitzungen und Rechte (M1)

Status: akzeptiert (M1)

## Mandant

- Der Mandant kommt aus der **Subdomain** (`demo.localhost`, Basis `BASE_DOMAIN`), nie aus Header oder Parameter des Clients. Die API vertraut `X-Forwarded-Host` (Fastify `trustProxy`), weil Next.js (Rewrite) bzw. Caddy davor stehen. **Die API darf deshalb nicht direkt aus dem Internet erreichbar sein.**
- Jede Anfrage läuft in einer Transaktion mit `SET LOCAL app.tenant_id` (Interceptor). Die API verbindet sich als Rolle `sp_app` (`DATABASE_APP_URL`): kein Eigentümer, kein `BYPASSRLS`. Migrationen, Seed und `tenant:create` laufen als Eigentümer (`DATABASE_URL`).
- `sp_app` darf `Tenant` nur lesen und `AuditLog` nur anhängen (kein UPDATE/DELETE). Das Passwort der Rolle setzt `pnpm db:setup-app-role`, nie eine Migration.
- Auth-Endpunkte (`@NoTransaction`) steuern ihre Transaktionen selbst, damit Fehlversuche und Audit-Einträge auch bei fehlgeschlagenen Anfragen bestehen bleiben.

## Sitzungen

- Cookie `sp_session` (httpOnly, SameSite=Lax, Secure bei https). In der Datenbank steht nur der SHA-256-Hash. Ablauf bei Inaktivität (`settings.security.sessionIdleMinutes`, Standard 8 h) und absolut nach 30 Tagen.
- Die Session-ID und das CSRF-Token **rotieren** bei jedem Zustandswechsel (Anmeldung, 2FA). Eine periodische Rotation ist bewusst nicht enthalten (parallele Anfragen würden sich abmelden).
- Zustände `ACTIVE`, `NEEDS_2FA_VERIFY`, `NEEDS_2FA_SETUP`. Fachrouten verlangen `ACTIVE`.
- **CSRF:** Schreibende Anfragen prüfen `Origin` gegen den Host (und `Sec-Fetch-Site`), angemeldete zusätzlich das Header-Token `x-csrf-token` (aus `/me` bzw. Login-Antwort).
- Ratenbegrenzung im Arbeitsspeicher je Instanz; Konto-Sperre nach 5 Fehlversuchen für 15 Minuten (pro Schule konfigurierbar).

## Zwei-Faktor

- TOTP (SHA-1, 6 Stellen, 30 s, ±1 Zeitscheibe) über `otpauth`. Das Geheimnis liegt mit AES-256-GCM verschlüsselt (`ENCRYPTION_KEY`, 32 Byte base64), dazu 10 Wiederherstellungscodes (nur Hash gespeichert, einmalig nutzbar). Pflicht für `TEACHER`, `HOMEROOM`, `PRINCIPAL`, `ADMIN`.
- **Bekannte Lücke:** Ein TOTP-Code kann innerhalb seiner Zeitscheibe wiederverwendet werden (kein Replay-Schutz über `lastTotpStep`). Als Folgeaufgabe vorgemerkt.

## Rechte

- `packages/shared/src/permissions.ts` ist die einzige Quelle: Matrix `Aktion × Rolle → Scope`, Funktion `can(user, action, resource?)`. Das `policy`-Modul der API lädt die Beziehungen (Kinder, Klassen, Fächer) und ruft sie auf.
- Jede Route muss `@Public()`, `@Authenticated()` oder `@Can(action)` deklarieren, sonst verweigert der Guard sie. Zwei Tests sichern das: Discovery aller Routen, und ein End-zu-End-Test, der für jede Aktion und jede Rolle einen HTTP-Aufruf aus der Matrix erzeugt.
- Matrixzeilen, die in der Spec mit "lesen/freigeben/Korrektur" nuanciert sind, wurden in eigene Aktionen geteilt (`masterdata.read/write`, `timetable.edit/publish`).

## Navigation

- Startseite nach dem Login: `/heute` für Schüler, Eltern, Lehrer, Klassenvorstand; **Direktion `/lagebild`, Administration `/admin/personen`** (deren erster Tab ist ihr "Heute"; Spec Abschnitt 5 nennt für diese Rollen kein `/heute`).
- Mehrere Rollen: Tab-Leiste der wichtigsten Rolle, erlaubte Routen aus der Vereinigung aller Rollen. Routen späterer Meilensteine zeigen einen Platzhalter, die Rollenprüfung gilt schon jetzt.

## Sonstiges

- E-Mails sind schlichte Texte; React-Email-Vorlagen folgen mit den Benachrichtigungen (M5). Versand direkt über SMTP, noch nicht über pg-boss.

## Nachtrag (vor M5): Schutz gegen Wiederverwendung von TOTP-Codes

`User.totpLastCounter` speichert die zuletzt benutzte 30-s-Zeitscheibe. Ein Code gilt nur, wenn seine Scheibe größer ist (atomares bedingtes Update). Damit kann ein mitgelesener Code nicht ein zweites Mal verwendet werden; erlaubt bleibt eine Scheibe Abweichung für ungenaue Uhren.
