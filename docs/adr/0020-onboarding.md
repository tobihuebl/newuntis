# ADR 0020: Onboarding-Engine mit Flows je Rolle

Status: angenommen (2026-10-14)

## Kontext

Das Onboarding-Konzept vom 14.10.2026 verlangt eine gemeinsame Engine statt der bisherigen festen Einführung
(`/willkommen` mit Datenschutz, Push und drei Tipps, M6). Jeder Flow hat dasselbe Gerüst: Beitritt, Willkommen
(höchstens drei Screens), Pflicht-Setup der Rolle, geführte erste Aktion ("Aha-Moment"), Checkliste mit Coachmarks
und Wiederholung über "Hilfe und Tour". Der Fortschritt liegt serverseitig, damit niemand den Ablauf am Handy ein
zweites Mal sieht.

Entscheidungen der Schule (Rückfrage vom 14.10.):

- Schüler:innen treten mit einem **persönlichen Code samt QR-Code** bei (Zugangsbrief vom Klassenvorstand), nicht
  mit einem Klassencode. Viele haben keine eigene E-Mail-Adresse.
- Lehrkräfte nur per **Einladung**, kein offener Schulcode.
- **Kein eigener Schritt für unter 14-Jährige**; die juristische Prüfung bleibt in der Spezifikation offen.
- Eigene Flows für **Administration, Direktion, Lehrkraft, Eltern, Schüler:in**; der Klassenvorstand bekommt
  Zusatzschritte im Lehrkraft-Flow.

## Entscheidung

1. **Flows als Konfiguration im Code** (`packages/shared/src/onboarding.ts`, versioniert), nicht als Tabelle
   `onboarding_flows`: Es gibt keinen Editor dafür, und Web und API brauchen dieselben Typen. Jeder Schritt hat
   Id, Phase (welcome, setup, aha, checklist), optional `required` (Pflicht), `auto` (erledigt sich durch Daten),
   Ziel und Anker für die Coachmark.
2. **Fortschritt je Person und Schritt** (`OnboardingProgress`: Status offen, erledigt, übersprungen, dazu erste
   Anzeige und Erledigung). Kommen Schritte dazu, sehen bestehende Personen nur die neuen. Bei der Einführung der
   Engine gilt "Benachrichtigungen" für bereits Eingeführte als erledigt; neue Pflichtschritte (z. B. Avatar und
   Klasse bestätigen) erscheinen einmal.
3. **Mehrere Rollen:** Die Flows werden zusammengesetzt (Willkommen einmal, dann Einrichtung, Aha und Checkliste
   je Rolle). Der Aha-Moment am Ende von `/willkommen` gehört zur Startrolle.
4. **Guard:** `/me.needsOnboarding` ist wahr, solange ein Pflichtschritt offen ist (Datenschutzhinweis über die
   Zustimmung in `Consent`). Optionale Schritte blockieren nie. Die Einrichtung der Schule (Administration) ist
   datengetrieben und blockiert nicht: Sie läuft über die Übersicht `/admin`.
5. **Datengetriebene Schritte** erkennt die API aus vorhandenen Daten mit dem frühesten Zeitpunkt (z. B. erste
   Anwesenheit oder erster Klassenbucheintrag der Lehrkraft, erster Zugangsbrief des Klassenvorstands, erste
   Abwesenheitsmeldung der Eltern). Abhaken lassen sie sich nicht.
6. **Coachmarks** über `?tour=<Schritt>` auf der echten Seite, Anker `data-tour="…"`. Am Computer neben dem
   Element, auf dem Handy als Leiste über der Tab-Leiste; nicht modal, Esc schließt. Die Checkliste steht auf der
   Startseite, am Computer zusätzlich als Fortschritt in der Seitenleiste.
7. **Zugangscode für Schüler:innen** (`AccessCode`, nur Hash): Der Klassenvorstand (`access.issue`, eigene Klasse;
   Administration alle) druckt Zugangsbriefe mit Benutzername, Code und QR-Code, auf Wunsch mit Eltern-Code. Der
   QR-Code führt auf `/zugang#code=…` (Fragment, nicht in Server-Logs). Einlösen setzt das Passwort; ein neuer
   Brief ersetzt offene Codes und dient auch zum Zurücksetzen (andere Sitzungen enden). Dafür ist
   `User.email` optional und es gibt `User.username` (eindeutig je Schule, z. B. `lena.huber`, sonst
   `lena.huber2`). Die Anmeldung nimmt E-Mail oder Benutzername.
8. **Avatar statt Foto:** Schüler:innen wählen Symbol und Fächerfarbe; keine Bilder von Kindern im System.
9. **Auswertung ohne Tracker:** step_viewed, step_completed und step_skipped ergeben sich aus dem Fortschritt;
   `/admin/onboarding/stats` zeigt je Flow begonnen, am Ziel, Median der Zeit bis zum Aha-Moment und je Schritt
   gesehen, erledigt, übersprungen. Nur Zahlen, keine Namen.
10. **Web und Handy:** Die App ist eine PWA. Derselbe Renderer zeigt am Computer eine Schrittliste, auf dem Handy
    eine Kachel-Leiste mit fixierter Aktionsleiste. Push wird vor dem System-Dialog erklärt (Permission-Priming);
    eine Kamera-Berechtigung braucht es nicht, der QR-Code wird mit der Kamera-App gescannt. Widgets gibt es in
    einer PWA nicht; an ihrer Stelle steht "App auf den Home-Bildschirm".

## Folgen

- Bestehende Konten sehen beim nächsten Öffnen die neuen Pflichtschritte ihrer Rolle (ein bis zwei Screens).
- Lehrkräfte bestätigen Fächer, Stunden und Stundenplan nur; Änderungen bleiben bei der Administration.
- "Hausübung abhaken" aus dem Konzept gibt es noch nicht; die Checkliste der Schüler:innen zeigt stattdessen, wo
  die Hausübungen stehen.
- Offen: Selbstregistrierung ohne Einladung gibt es nicht; die Einwilligung unter 14 Jahren ist juristisch zu
  prüfen.
