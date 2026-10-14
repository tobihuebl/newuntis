import { TransitionScreen } from '../../../../src/components/transition/transition-screen';
import { adminPage } from '../../../../src/lib/admin';

/** Schuljahreswechsel-Assistent (SD-05) der Administration. */
export default async function Page() {
  await adminPage('/admin/schuljahreswechsel');
  return <TransitionScreen />;
}
