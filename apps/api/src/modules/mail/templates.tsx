/**
 * E-Mail-Vorlagen (React Email, Spec Abschnitt 7). Schlicht, ohne externe Bilder oder Schriften,
 * jede Mail auch als Klartext. Texte enthalten keine Namen von Schüler:innen.
 */
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import { render } from '@react-email/render';
import { BRAND, DESIGN_COLORS } from '@sp/shared';

const c = DESIGN_COLORS.light;
const colors = { primary: c.brand, text: c.ink, muted: c['ink-muted'], bg: c.bg, line: c.line };

function Layout({
  preview,
  school,
  title,
  children,
}: {
  preview: string;
  school: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Html lang="de-AT">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: colors.bg,
          fontFamily: 'system-ui, sans-serif',
          color: colors.text,
        }}
      >
        <Container style={{ maxWidth: 520, padding: '24px 16px' }}>
          <Text style={{ color: colors.muted, fontSize: 14, margin: 0 }}>{school}</Text>
          <Heading as="h1" style={{ fontSize: 22, margin: '8px 0 16px' }}>
            {title}
          </Heading>
          {children}
          <Hr style={{ borderColor: colors.line, margin: '24px 0' }} />
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            Diese Nachricht wurde automatisch von {BRAND.name} versendet. Einstellungen für
            Benachrichtigungen findest du im Profil.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

function Action({ href, label }: { href: string; label: string }) {
  return (
    <Section style={{ margin: '16px 0' }}>
      <Button
        href={href}
        style={{
          backgroundColor: colors.primary,
          color: DESIGN_COLORS.light['on-brand'],
          borderRadius: 8,
          padding: '12px 18px',
          fontWeight: 600,
        }}
      >
        {label}
      </Button>
      <Text style={{ color: colors.muted, fontSize: 12, wordBreak: 'break-all' }}>{href}</Text>
    </Section>
  );
}

export type MailTemplate =
  | { kind: 'invitation'; school: string; url: string; validDays: number }
  | { kind: 'passwordReset'; school: string; url: string; validMinutes: number }
  | { kind: 'notification'; school: string; title: string; body: string; url: string };

export interface RenderedMail {
  subject: string;
  html: string;
  text: string;
}

function content(t: MailTemplate): { subject: string; element: React.ReactElement } {
  switch (t.kind) {
    case 'invitation':
      return {
        subject: `Einladung zu ${BRAND.name} (${t.school})`,
        element: (
          <Layout preview="Lege dein Passwort fest" school={t.school} title="Willkommen!">
            <Text>Du wurdest zu {BRAND.name} eingeladen. Lege jetzt dein Passwort fest.</Text>
            <Action href={t.url} label="Passwort festlegen" />
            <Text>Der Link ist {t.validDays} Tage gültig.</Text>
          </Layout>
        ),
      };
    case 'passwordReset':
      return {
        subject: 'Passwort zurücksetzen',
        element: (
          <Layout
            preview="Setze dein Passwort zurück"
            school={t.school}
            title="Passwort zurücksetzen"
          >
            <Text>Mit diesem Link setzt du dein Passwort zurück.</Text>
            <Action href={t.url} label="Neues Passwort festlegen" />
            <Text>
              Der Link ist {t.validMinutes} Minuten gültig. Wenn du das nicht angefordert hast,
              ignoriere diese E-Mail.
            </Text>
          </Layout>
        ),
      };
    case 'notification':
      return {
        subject: t.title,
        element: (
          <Layout preview={t.body} school={t.school} title={t.title}>
            <Text>{t.body}</Text>
            <Action href={t.url} label="In der App öffnen" />
          </Layout>
        ),
      };
  }
}

export async function renderMail(t: MailTemplate): Promise<RenderedMail> {
  const { subject, element } = content(t);
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { subject, html, text };
}
