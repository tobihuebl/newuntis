import type { useTranslations } from 'next-intl';

type T = ReturnType<typeof useTranslations>;

/** Gibt jedem Text den Parameter formal ("yes"/"no") mit (Anrede nach Rolle, src/lib/i18n.tsx). */
export function withFormal(t: T, formal: 'yes' | 'no'): T {
  type Values = Record<string, unknown> | undefined;
  const f = ((key: string, values?: Values, formats?: unknown) =>
    (t as (k: string, v: Values, f: unknown) => string)(key, { formal, ...values }, formats)) as T;
  const rich = t.rich as (k: string, v: Values, f: unknown) => React.ReactNode;
  const markup = t.markup as (k: string, v: Values, f: unknown) => string;
  return Object.assign(f, {
    rich: ((key: string, values?: Values, formats?: unknown) =>
      rich(key, { formal, ...values }, formats)) as T['rich'],
    markup: ((key: string, values?: Values, formats?: unknown) =>
      markup(key, { formal, ...values }, formats)) as T['markup'],
    raw: t.raw,
    has: t.has,
  });
}
