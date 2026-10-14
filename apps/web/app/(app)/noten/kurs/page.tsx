import { notFound } from 'next/navigation';
import { CourseScreen } from '../../../../src/components/grades/course-screen';
import { requireRoute } from '../../../../src/lib/route-guard';

/** Noten eines Fachs in einer Klasse oder Gruppe (?klasse= bzw. ?gruppe=, ?fach=, optional ?leistung=). */
export default async function KursPage({
  searchParams,
}: {
  searchParams: Promise<{ klasse?: string; gruppe?: string; fach?: string; leistung?: string }>;
}) {
  await requireRoute('/noten/kurs');
  const q = await searchParams;
  if (!q.fach || (!q.klasse && !q.gruppe)) notFound();
  return (
    <CourseScreen
      course={{
        classId: q.klasse ?? null,
        groupId: q.klasse ? null : (q.gruppe ?? null),
        subjectId: q.fach,
      }}
      selected={q.leistung}
    />
  );
}
