import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';
import { TYPE_STYLES } from './tokens.generated';

/**
 * tailwind-merge kennt die Token-Utilities des Design Systems: Schriftstile (text-h1 …) sind Schriftgrößen, nicht
 * Farben; Schatten, Radien und Ebenen kommen aus den Tokens.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [...TYPE_STYLES],
      shadow: ['card', 'pop', 'key-brand', 'key-signal'],
      radius: ['pill'],
    },
    classGroups: {
      z: ['z-nav', 'z-sheet', 'z-toast'],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
