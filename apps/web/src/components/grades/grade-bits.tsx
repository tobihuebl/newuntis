'use client';
import { GRADE_VALUES, type AssessmentItem, type CourseRef, type GradeWeights } from '@sp/shared';
import { cn } from '@sp/ui';
import { useT } from '../../lib/i18n';

const avgFormat = new Intl.NumberFormat('de-AT', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

/** Durchschnitt mit Komma ("2,35"); ohne Noten ein Strich. */
export const formatAverage = (n: number | null | undefined) =>
  n === null || n === undefined ? '–' : avgFormat.format(n);

/** Adresse eines Kurses (Fach in Klasse oder Gruppe), optional mit gewählter Leistung. */
export function courseHref(c: CourseRef, assessmentId?: string) {
  const p = new URLSearchParams();
  if (c.classId) p.set('klasse', c.classId);
  if (c.groupId) p.set('gruppe', c.groupId);
  p.set('fach', c.subjectId);
  if (assessmentId) p.set('leistung', assessmentId);
  return `/noten/kurs?${p}`;
}

/** Gewichtung als kurze Zeile: "Schularbeit 50 % · Test 25 % …" (nur Arten über 0 %). */
export function WeightsLine({ weights }: { weights: GradeWeights }) {
  const t = useT('grades');
  return (
    <span>
      {(Object.keys(weights) as (keyof GradeWeights)[])
        .filter((k) => weights[k] > 0)
        .map((k) => t('weightPart', { kind: t(`kind_${k}`), percent: weights[k] }))
        .join(' · ')}
    </span>
  );
}

/** Notenspiegel: Balken je Note 1 bis 5 mit Anzahl, darunter der Durchschnitt. */
export function GradeSpread({
  distribution,
  className,
}: {
  distribution: AssessmentItem['distribution'];
  className?: string;
}) {
  const t = useT('grades');
  const max = Math.max(1, ...GRADE_VALUES.map((v) => distribution.counts[v]));
  const total = GRADE_VALUES.reduce((s, v) => s + distribution.counts[v], 0);
  return (
    <figure className={cn('flex flex-col gap-2', className)}>
      <figcaption className="sr-only">
        {t('spreadLabel', {
          list: GRADE_VALUES.map((v) => `${v}: ${distribution.counts[v]}`).join(', '),
        })}
      </figcaption>
      <div className="flex h-16 items-end gap-2" aria-hidden="true">
        {GRADE_VALUES.map((v) => (
          <div key={v} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-mono-sm text-ink-muted">{distribution.counts[v]}</span>
            <span
              className={cn('w-full rounded-xs', v === 5 ? 'bg-signal' : 'bg-brand')}
              style={{
                height: `${(distribution.counts[v] / max) * 2.5}rem`,
                minHeight: '0.125rem',
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2 text-caption text-ink-muted" aria-hidden="true">
        {GRADE_VALUES.map((v) => (
          <span key={v} className="flex-1 text-center">
            {v}
          </span>
        ))}
      </div>
      <p className="text-caption text-ink-muted">
        {total
          ? t('spreadAverage', { average: formatAverage(distribution.average), count: total })
          : t('spreadEmpty')}
      </p>
    </figure>
  );
}
