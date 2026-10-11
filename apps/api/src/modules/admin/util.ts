import { BadRequestException } from '@nestjs/common';

/** "YYYY-MM-DD" als UTC-Mitternacht (Spalten vom Typ @db.Date). */
export const toDate = (s: string): Date => new Date(`${s}T00:00:00.000Z`);
export const today = (): Date => toDate(new Date().toISOString().slice(0, 10));
/** Gestern (UTC-Datum): Ende einer Einschreibung oder Verknüpfung, die ab heute nicht mehr gilt. */
export const yesterday = (): Date => new Date(today().getTime() - 86_400_000);
export const isoDate = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);
export const list = <T>(data: T[]) => ({ data, nextCursor: null as string | null });

export function bad(title: string, extra: Record<string, unknown> = {}): never {
  throw new BadRequestException({ title, ...extra });
}
