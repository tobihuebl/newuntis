'use client';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Eindeutiger Browser-Titel je Seite (WCAG 2.4.2): "<Seitentitel> · PROfessor" aus der h1 der Seite. Seiten,
 * deren Überschrift Namen enthält (Person, Kind, Begrüßung), geben mit data-doc-title einen neutralen Titel vor
 * (Design System: keine Schüler- oder Elternnamen in Titeln).
 */
export function DocumentTitle({ brand }: { brand: string }) {
  const pathname = usePathname();
  useEffect(() => {
    const apply = () => {
      const el =
        document.querySelector<HTMLElement>('[data-doc-title]') ??
        document.querySelector<HTMLElement>('h1');
      const text = (el?.dataset.docTitle ?? el?.textContent ?? '').replace(/\s+/g, ' ').trim();
      const next = text && text !== brand ? `${text} · ${brand}` : brand;
      if (document.title !== next) document.title = next;
    };
    apply();
    // Inhalte laden oft nach (Client-Abfragen): Überschrift beobachten
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [pathname, brand]);
  return null;
}
