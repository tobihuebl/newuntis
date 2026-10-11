'use client';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@sp/ui';
import { apiPost } from '../../lib/api-client';

export function DefaultPeriodsButton({ csrfToken }: { csrfToken: string }) {
  const t = useTranslations('admin.periods');
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
