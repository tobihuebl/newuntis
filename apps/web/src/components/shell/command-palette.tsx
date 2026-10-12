'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { CornerDownLeft, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useState } from 'react';
import type { NavItem } from '@sp/shared';
import { cn } from '@sp/ui';
import { NAV_ICONS } from '../nav-icons';
import { normalize } from './nav-model';

/**
 * Befehlspalette (Strg/Cmd + K, Design System "Web und Mobile" Abschnitt 1): findet die Seiten der eigenen Rolle.
 * Personensuche folgt mit PL-06 (V1). Tastatur: Pfeile wählen, Enter öffnet, Esc schließt.
 */
export function CommandPalette({
  open,
  onOpenChange,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: NavItem[];
}) {
  const t = useTranslations('nav');
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);

  const results = useMemo(() => {
    const q = normalize(query.trim());
    return items.filter((i) => !q || normalize(t(i.labelKey)).includes(q));
  }, [items, query, t]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setIndex(0);
    }
  }, [open]);

  const go = (i: NavItem | undefined) => {
    if (!i) return;
    onOpenChange(false);
    router.push(i.href);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="pf-scrim fixed inset-0 z-sheet animate-fade-in" />
        <Dialog.Content className="fixed inset-x-4 top-[12dvh] z-sheet mx-auto flex max-h-[70dvh] max-w-130 animate-dialog-in flex-col overflow-hidden rounded-xl bg-bg-raised text-ink shadow-pop">
          <Dialog.Title className="sr-only">{t('commandTitle')}</Dialog.Title>
          <Dialog.Description className="sr-only">{t('commandHint')}</Dialog.Description>
          <div className="flex items-center gap-3 border-b border-line px-4">
            <Search aria-hidden="true" className="size-5 shrink-0 text-ink-muted" />
            <input
              autoFocus
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={results[index] ? `${listId}-${index}` : undefined}
              aria-label={t('commandPlaceholder')}
              placeholder={t('commandPlaceholder')}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setIndex(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setIndex((i) => Math.min(i + 1, results.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setIndex((i) => Math.max(i - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  go(results[index]);
                }
              }}
              className="min-h-14 flex-1 bg-transparent text-body outline-none placeholder:text-ink-subtle"
            />
          </div>
          <ul
            id={listId}
            role="listbox"
            aria-label={t('commandTitle')}
            className="overflow-y-auto p-2"
          >
            {results.length === 0 ? (
              <li className="px-3 py-4 text-body-sm text-ink-muted">{t('commandEmpty')}</li>
            ) : (
              results.map((i, n) => {
                const Icon = NAV_ICONS[i.icon];
                return (
                  <li
                    key={i.href}
                    id={`${listId}-${n}`}
                    role="option"
                    aria-selected={n === index}
                    onMouseEnter={() => setIndex(n)}
                    onClick={() => go(i)}
                    className={cn(
                      'flex min-h-(--tap-min) cursor-pointer items-center gap-3 rounded-md px-3 text-label',
                      n === index ? 'bg-brand-soft text-ink' : 'text-ink',
                    )}
                  >
                    {Icon ? <Icon aria-hidden="true" className="size-5 text-brand-text" /> : null}
                    <span className="flex-1">{t(i.labelKey)}</span>
                    {n === index ? (
                      <CornerDownLeft aria-hidden="true" className="size-4 text-ink-muted" />
                    ) : null}
                  </li>
                );
              })
            )}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
