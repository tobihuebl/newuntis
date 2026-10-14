'use client';
import * as Dialog from '@radix-ui/react-dialog';
import {
  CornerDownLeft,
  DoorOpen,
  GraduationCap,
  Search,
  User,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useState } from 'react';
import type { NavItem, SearchKind, SearchResult } from '@sp/shared';
import { cn } from '@sp/ui';
import { NAV_ICONS } from '../nav-icons';
import { normalize } from './nav-model';
import { useT } from '../../lib/i18n';
import { useApi } from '../../lib/use-api';

const DEBOUNCE_MS = 200;

const KIND_ICON: Record<SearchKind, LucideIcon> = {
  person: User,
  teacher: GraduationCap,
  student: User,
  class: UsersRound,
  room: DoorOpen,
};
type Group = 'pages' | 'people' | 'classes' | 'rooms';
const GROUP_OF: Record<SearchKind, Group> = {
  person: 'people',
  teacher: 'people',
  student: 'people',
  class: 'classes',
  room: 'rooms',
};

interface Option {
  key: string;
  group: Group;
  label: string;
  detail: string | null;
  icon: LucideIcon | undefined;
  href: string;
}

/**
 * Befehlspalette (Strg/Cmd + K, Design System "Web und Mobile" Abschnitt 1): findet die Seiten der eigenen Rolle
 * und mit `entities` (PL-06) auch Personen, Klassen und Räume nach den Rechten der Person. Offline nur Seiten.
 * Tastatur: Pfeile wählen, Enter öffnet, Esc schließt.
 */
export function CommandPalette({
  open,
  onOpenChange,
  items,
  entities = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: NavItem[];
  entities?: boolean;
}) {
  const t = useT('nav');
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const h = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(h);
  }, [query]);
  const remote = useApi<{ data: SearchResult[] }>(
    ['search', debounced],
    entities && open && debounced.length >= 2 ? `/search?q=${encodeURIComponent(debounced)}` : null,
  );

  const options = useMemo<Option[]>(() => {
    const q = normalize(query.trim());
    const pages: Option[] = items
      .filter((i) => !q || normalize(t(i.labelKey)).includes(q))
      .map((i) => ({
        key: `page:${i.href}`,
        group: 'pages',
        label: t(i.labelKey),
        detail: null,
        icon: NAV_ICONS[i.icon],
        href: i.href,
      }));
    const found: Option[] =
      q.length >= 2
        ? (remote.data?.data ?? []).map((r) => ({
            key: `${r.kind}:${r.id}`,
            group: GROUP_OF[r.kind],
            label: r.label,
            detail: [kindOf(r), r.detail, hintOf(r.kind)].filter(Boolean).join(' · ') || null,
            icon: KIND_ICON[r.kind],
            href: r.href,
          }))
        : [];
    const order: Group[] = ['pages', 'people', 'classes', 'rooms'];
    return [...pages, ...found].sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));

    function kindOf(r: SearchResult): string | null {
      const k =
        r.personKind ??
        (r.kind === 'teacher' ? 'TEACHER' : r.kind === 'student' ? 'STUDENT' : null);
      return k ? t(`kind_${k}`) : null;
    }
    function hintOf(kind: SearchKind): string | null {
      return kind === 'teacher' || kind === 'class' || kind === 'room' ? t('searchPlan') : null;
    }
  }, [items, query, remote.data, t]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setDebounced('');
      setIndex(0);
    }
  }, [open]);
  useEffect(() => setIndex((i) => Math.min(i, Math.max(options.length - 1, 0))), [options.length]);

  const go = (o: Option | undefined) => {
    if (!o) return;
    onOpenChange(false);
    router.push(o.href);
  };
  const groups = (['pages', 'people', 'classes', 'rooms'] as const).filter((g) =>
    options.some((o) => o.group === g),
  );
  const searching =
    entities && query.trim().length >= 2 && (remote.isFetching || query.trim() !== debounced);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="pf-scrim fixed inset-0 z-sheet animate-fade-in" />
        <Dialog.Content className="fixed inset-x-4 top-[12dvh] z-sheet mx-auto flex max-h-[70dvh] max-w-130 animate-dialog-in flex-col overflow-hidden rounded-xl bg-bg-raised text-ink shadow-pop">
          <Dialog.Title className="sr-only">
            {entities ? t('searchAll') : t('commandTitle')}
          </Dialog.Title>
          <Dialog.Description className="sr-only">{t('commandHint')}</Dialog.Description>
          <div className="flex items-center gap-3 border-b border-line px-4">
            <Search aria-hidden="true" className="size-5 shrink-0 text-ink-muted" />
            <input
              autoFocus
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={options[index] ? `${listId}-${index}` : undefined}
              aria-label={entities ? t('searchPlaceholderAll') : t('commandPlaceholder')}
              placeholder={entities ? t('searchPlaceholderAll') : t('commandPlaceholder')}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setIndex(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setIndex((i) => Math.min(i + 1, options.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setIndex((i) => Math.max(i - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  go(options[index]);
                }
              }}
              className="min-h-14 flex-1 bg-transparent text-body outline-none placeholder:text-ink-subtle"
            />
          </div>
          <div
            id={listId}
            role="listbox"
            aria-label={entities ? t('searchAll') : t('commandTitle')}
            aria-busy={searching || undefined}
            className="overflow-y-auto p-2"
          >
            {options.length === 0 ? (
              <p className="px-3 py-4 text-body-sm text-ink-muted">
                {searching ? t('searchLoading') : t('commandEmpty')}
              </p>
            ) : (
              groups.map((g) => (
                <div key={g} role="group" aria-labelledby={`${listId}-g-${g}`}>
                  {/* Überschriften nur, wenn mehr als Seiten gefunden wurden */}
                  <p
                    id={`${listId}-g-${g}`}
                    role="presentation"
                    className={cn(
                      'px-3 pt-3 pb-1 text-overline text-ink-muted',
                      groups.length === 1 && 'sr-only',
                    )}
                  >
                    {t(`searchGroup_${g}`)}
                  </p>
                  {options.map((o, n) =>
                    o.group !== g ? null : (
                      <div
                        key={o.key}
                        id={`${listId}-${n}`}
                        role="option"
                        aria-selected={n === index}
                        onMouseEnter={() => setIndex(n)}
                        onClick={() => go(o)}
                        className={cn(
                          'flex min-h-(--tap-min) cursor-pointer items-center gap-3 rounded-md px-3 py-1.5 text-label',
                          n === index ? 'bg-brand-soft text-ink' : 'text-ink',
                        )}
                      >
                        {o.icon ? (
                          <o.icon aria-hidden="true" className="size-5 shrink-0 text-brand-text" />
                        ) : null}
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate">{o.label}</span>
                          {o.detail ? (
                            <span className="truncate text-caption text-ink-muted">{o.detail}</span>
                          ) : null}
                        </span>
                        {n === index ? (
                          <CornerDownLeft aria-hidden="true" className="size-4 text-ink-muted" />
                        ) : null}
                      </div>
                    ),
                  )}
                </div>
              ))
            )}
          </div>
          {searching && options.length > 0 ? (
            <p className="sr-only" aria-live="polite">
              {t('searchLoading')}
            </p>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
