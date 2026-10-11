import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE } from '@sp/shared';

export default getRequestConfig(async () => ({
  locale: DEFAULT_LOCALE,
  timeZone: 'Europe/Vienna',
  messages: (await import(`../../messages/${DEFAULT_LOCALE}.json`)).default,
}));
