'use client';
import { useTranslations } from 'next-intl';
import { createContext, useContext, useMemo } from 'react';
import { withFormal } from './i18n-core';

/**
 * Anrede nach Rolle (Design System, Inhaltliche Grundsätze; Entscheidung F4): du für Schüler:innen, Lehrkräfte und
 * Klassenvorstände, Sie für Eltern, Direktion und Administration. Ohne Anmeldung (öffentliche Seiten) gilt Sie.
 * Texte wählen die Fassung mit {formal, select, yes {…} other {…}}.
 */
const FormalContext = createContext(true);

export function FormalProvider({
  formal,
  children,
}: {
  formal: boolean;
  children: React.ReactNode;
}) {
  return <FormalContext.Provider value={formal}>{children}</FormalContext.Provider>;
}

export const useFormal = () => useContext(FormalContext);

type T = ReturnType<typeof useTranslations>;

/** Wie useTranslations, gibt aber jedem Text den Parameter formal ("yes"/"no") mit. */
export function useT(namespace?: string): T {
  const t = useTranslations(namespace);
  const formal = useContext(FormalContext) ? 'yes' : 'no';
  return useMemo(() => withFormal(t, formal), [t, formal]);
}
