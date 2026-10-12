import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import './globals.css';

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

export const viewport: Viewport = {
  themeColor: '#4F46E5',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
