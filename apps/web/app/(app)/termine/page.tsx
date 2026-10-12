import { Suspense } from 'react';
import { TasksScreen } from '../../../src/components/student/tasks-screen';
import { requireRoute } from '../../../src/lib/route-guard';

export default async function TerminePage() {
  await requireRoute('/termine');
  return (
    <Suspense>
      <TasksScreen mode="guardian" />
    </Suspense>
  );
}
