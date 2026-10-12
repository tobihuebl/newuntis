import { Suspense } from 'react';
import { TasksScreen } from '../../../src/components/student/tasks-screen';
import { requireRoute } from '../../../src/lib/route-guard';

export default async function AufgabenPage() {
  await requireRoute('/aufgaben');
  return (
    <Suspense>
      <TasksScreen mode="student" />
    </Suspense>
  );
}
