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
const colors = {
  brand: c.brand,
  brandText: c['brand-text'],
  signal: c.signal,
  text: c.ink,
  muted: c['ink-muted'],
  bg: c.bg,
  card: c['bg-raised'],
  line: c.line,
};
/** Ersatzschrift ohne Installation (CI-Handbuch, Typografie): Arial für Überschrift und Text. */
const FONT = 'Arial, Helvetica, sans-serif';

function Layout({
  preview,
  school,
  title,
  formal,
  children,
}: {
  preview: string;
  school: string;
  title: string;
  formal: boolean;
  children: React.ReactNode;
}) {
  return (
    <Html lang="de-AT">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: colors.bg, fontFamily: FONT, color: colors.text, margin: 0 }}>
        <Container style={{ maxWidth: 520, padding: '32px 16px' }}>
          {/* Wortmarke als Text (keine externen Bilder): PRO in Kobalt, fessor in Nacht, ohne Punkt */}
          <Text style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.04em', margin: '0 0 24px' }}>
            <span style={{ color: colors.brand }}>PRO</span>
            <span style={{ color: colors.text }}>fessor</span>
          </Text>
          <Section
            style={{
              backgroundColor: colors.card,
              border: `1px solid ${colors.line}`,
              borderRadius: 20,
              padding: '24px 20px',
            }}
          >
            <Text
              style={{
                color: colors.brandText,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                margin: 0,
              }}
            >
              {school}
            </Text>
            <Heading as="h1" style={{ fontSize: 24, lineHeight: '30px', margin: '8px 0 16px' }}>
              {title}
            </Heading>
            {children}
          </Section>
          <Hr style={{ borderColor: colors.line, margin: '24px 0' }} />
          <Text style={{ color: colors.muted, fontSize: 12, lineHeight: '18px' }}>
            Diese Nachricht wurde automatisch von {BRAND.name} versendet.{' '}
            {formal
              ? 'Einstellungen für Benachrichtigungen finden Sie im Profil.'
              : 'Einstellungen für Benachrichtigungen findest du im Profil.'}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

function Action({ href, label }: { href: string; label: string }) {
  return (
    <Section style={{ margin: '20px 0 8px' }}>
      <Button
        href={href}
        style={{
          backgroundColor: colors.brand,
          color: DESIGN_COLORS.light['on-brand'],
          borderRadius: 14,
          padding: '14px 20px',
          fontWeight: 700,
          fontFamily: FONT,
        }}
      >
        {label}
      </Button>
      <Text style={{ color: colors.muted, fontSize: 12, wordBreak: 'break-all' }}>{href}</Text>
    </Section>
  );
}

/** `formal`: Anrede Sie (Eltern, Direktion, Administration) oder du (Schüler:innen, Lehrkräfte). */
export type MailTemplate =
  | { kind: 'invitation'; school: string; url: string; validDays: number; formal: boolean }
  | { kind: 'passwordReset'; school: string; url: string; validMinutes: number; formal: boolean }
  | {
      kind: 'notification';
      school: string;
      title: string;
      body: string;
      url: string;
      formal: boolean;
    };

export interface RenderedMail {
  subject: string;
  html: string;
  text: string;
}

function content(t: MailTemplate): { subject: string; element: React.ReactElement } {
  const f = t.formal;
  switch (t.kind) {
    case 'invitation':
      return {
        subject: `Einladung zu ${BRAND.name} (${t.school})`,
        element: (
          <Layout
            preview={f ? 'Legen Sie Ihr Passwort fest' : 'Lege dein Passwort fest'}
            school={t.school}
            title={`Willkommen bei ${BRAND.name}`}
            formal={f}
          >
            <Text>
              {f
                ? `Sie wurden zu ${BRAND.name} eingeladen. Legen Sie jetzt Ihr Passwort fest.`
                : `Du wurdest zu ${BRAND.name} eingeladen. Lege jetzt dein Passwort fest.`}
            </Text>
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
            preview={f ? 'Setzen Sie Ihr Passwort zurück' : 'Setze dein Passwort zurück'}
            school={t.school}
            title="Passwort zurücksetzen"
            formal={f}
          >
            <Text>
              {f
                ? 'Mit diesem Link setzen Sie Ihr Passwort zurück.'
                : 'Mit diesem Link setzt du dein Passwort zurück.'}
            </Text>
            <Action href={t.url} label="Neues Passwort festlegen" />
            <Text>
              Der Link ist {t.validMinutes} Minuten gültig.{' '}
              {f
                ? 'Wenn Sie das nicht angefordert haben, können Sie diese E-Mail ignorieren.'
                : 'Wenn du das nicht angefordert hast, kannst du diese E-Mail ignorieren.'}
            </Text>
          </Layout>
        ),
      };
    case 'notification':
      return {
        subject: t.title,
        element: (
          <Layout preview={t.body} school={t.school} title={t.title} formal={f}>
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
