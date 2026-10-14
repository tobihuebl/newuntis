'use client';
import {
  Bird,
  Cat,
  Dog,
  Fish,
  Flower2,
  Leaf,
  Moon,
  Rabbit,
  Rocket,
  Star,
  Sun,
  Turtle,
  type LucideIcon,
} from 'lucide-react';
import {
  AVATAR_COLORS,
  AVATAR_SYMBOLS,
  avatarOf,
  type AvatarColor,
  type AvatarSymbol,
} from '@sp/shared';
import { FACH_BG, cn } from '@sp/ui';
import { useT } from '../../lib/i18n';

const ICONS: Record<AvatarSymbol, LucideIcon> = {
  cat: Cat,
  dog: Dog,
  rabbit: Rabbit,
  bird: Bird,
  fish: Fish,
  turtle: Turtle,
  rocket: Rocket,
  star: Star,
  sun: Sun,
  moon: Moon,
  flower: Flower2,
  leaf: Leaf,
};

/** Avatar aus Symbol und Fächerfarbe; ohne Wahl der erste Buchstabe des Namens. */
export function Avatar({
  value,
  name,
  className,
}: {
  value: string | null | undefined;
  name: string;
  className?: string;
}) {
  const a = avatarOf(value);
  if (!a) {
    return (
      <span className={cn('pf-att__avatar bg-brand-soft', className)} aria-hidden="true">
        {name.slice(0, 1)}
      </span>
    );
  }
  const Icon = ICONS[a.symbol];
  return (
    <span
      className={cn('pf-att__avatar text-on-fach', FACH_BG[a.color], className)}
      aria-hidden="true"
    >
      <Icon className="size-4" />
    </span>
  );
}

/** Auswahl von Symbol und Farbe als zwei Optionsgruppen (Tastatur: Pfeiltasten über native Radios). */
export function AvatarPicker({
  symbol,
  color,
  onChange,
}: {
  symbol: AvatarSymbol;
  color: AvatarColor;
  onChange: (v: { symbol: AvatarSymbol; color: AvatarColor }) => void;
}) {
  const t = useT('onboarding');
  const option = 'pf-focusable flex size-12 cursor-pointer items-center justify-center rounded-md';
  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-label">{t('avatarSymbol')}</legend>
        <div className="grid grid-cols-6 gap-2">
          {AVATAR_SYMBOLS.map((s) => {
            const Icon = ICONS[s];
            return (
              <label
                key={s}
                className={cn(
                  option,
                  'text-on-fach has-focus-visible:ring-3 has-focus-visible:ring-focus',
                  FACH_BG[color],
                  s === symbol ? 'ring-3 ring-ink' : 'opacity-70',
                )}
              >
                <input
                  type="radio"
                  name="avatar-symbol"
                  className="sr-only"
                  checked={s === symbol}
                  onChange={() => onChange({ symbol: s, color })}
                />
                <Icon aria-hidden="true" className="size-6" />
                <span className="sr-only">{t(`avatar_${s}`)}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-label">{t('avatarColor')}</legend>
        <div className="grid grid-cols-8 gap-2">
          {AVATAR_COLORS.map((c) => (
            <label
              key={c}
              className={cn(
                option,
                'size-10 has-focus-visible:ring-3 has-focus-visible:ring-focus',
                FACH_BG[c],
                c === color && 'ring-3 ring-ink',
              )}
            >
              <input
                type="radio"
                name="avatar-color"
                className="sr-only"
                checked={c === color}
                onChange={() => onChange({ symbol, color: c })}
              />
              <span className="sr-only">{t(`color_${c}`)}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
