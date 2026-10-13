'use client';
import { TriangleAlert } from 'lucide-react';
import { Banner, Button } from '@sp/ui';
import { useT } from '../lib/i18n';
import { useProblemText } from '../lib/use-api';

/** Ladefehler einer Ansicht (Design System, Zustände): Banner mit Grund und "Erneut versuchen", nie nur ein Toast. */
export function LoadError({ error, onRetry }: { error?: unknown; onRetry: () => void }) {
  const tc = useT('common');
  const problem = useProblemText();
  return (
    <Banner
      tone="danger"
      icon={TriangleAlert}
      action={
        <Button size="sm" variant="secondary" onClick={onRetry}>
          {tc('retry')}
        </Button>
      }
    >
      {(error ? problem(error) : null) ?? tc('error')}
    </Banner>
  );
}
