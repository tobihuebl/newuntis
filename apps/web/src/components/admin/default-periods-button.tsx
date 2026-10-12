'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@sp/ui';
import { apiPost } from '../../lib/api-client';
import { useT } from '../../lib/i18n';

export function DefaultPeriodsButton({ csrfToken }: { csrfToken: string }) {
  const t = useT('admin.periods');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await apiPost('/admin/periods/default-template', undefined, csrfToken);
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      {t('template')}
    </Button>
  );
}
