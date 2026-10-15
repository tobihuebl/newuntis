import { ConsentFormsScreen, MyConsentForms } from '../../../src/components/consent/consent-forms';
import { navigationOf } from '../../../src/lib/nav-server';
import { requireRoute } from '../../../src/lib/route-guard';

/** Einverständniserklärungen (KO-05): Eltern beantworten, Lehrkräfte, Direktion und Administration verschicken. */
export default async function EinverstaendnisPage() {
  const me = await requireRoute('/einverstaendnis');
  const { view } = await navigationOf(me);
  return view === 'GUARDIAN' ? <MyConsentForms /> : <ConsentFormsScreen />;
}
