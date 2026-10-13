import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, DM_Sans, JetBrains_Mono } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { cookies } from 'next/headers';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { THEME_COLOR, THEME_COOKIE, parseTheme } from '../src/lib/theme';
import { BRAND } from '@sp/shared';
import { DocumentTitle } from '../src/components/document-title';
import './globals.css';

// Schriften des Design Systems, beim Build geladen und von der eigenen Domain ausgeliefert (keine Anfrage an Google)
const display = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['700', '800'],
  variable: '--font-bricolage',
  display: 'swap',
});
const text = DM_Sans({ subsets: ['latin'], variable: '--font-dmsans', display: 'swap' });
const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return {
    title: t('name'),
    applicationName: t('name'),
    icons: {
      icon: [{ url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' }],
      apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
    },
    appleWebApp: { capable: true, title: t('name'), statusBarStyle: 'default' },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
    themeColor:
      theme === 'system'
        ? [
            { media: '(prefers-color-scheme: light)', color: THEME_COLOR.light },
            { media: '(prefers-color-scheme: dark)', color: THEME_COLOR.dark },
          ]
        : THEME_COLOR[theme],
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  // Theme aus dem Cookie, sonst wie das Gerät (prefers-color-scheme)
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html
      lang={locale}
      data-theme={theme === 'system' ? undefined : theme}
      className={`${display.variable} ${text.variable} ${mono.variable}`}
    >
      <body className="bg-bg font-body text-ink antialiased">
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
        <DocumentTitle brand={BRAND.name} />
      </body>
    </html>
  );
}
