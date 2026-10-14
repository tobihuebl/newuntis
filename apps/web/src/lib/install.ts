'use client';
import { useEffect, useState } from 'react';

/**
 * Installation als App (Design System, PWA): Chromium meldet die Möglichkeit über "beforeinstallprompt", iOS
 * kennt nur "Zum Home-Bildschirm" im Teilen-Menü. Der Hinweis erscheint in "Mehr" und einmalig nach der zweiten
 * Sitzung; "Nicht jetzt" blendet ihn auf diesem Gerät aus (localStorage, reine Bequemlichkeit).
 */
interface PromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED = 'pf-install-dismissed';
const SHOWN_ONCE = 'pf-install-shown';
const SESSIONS = 'pf-sessions';

let deferred: PromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // eigener Hinweis statt Browser-Leiste
    deferred = e as PromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

const read = (k: string) => {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    window.localStorage.setItem(k, v);
  } catch {
    // Speicher gesperrt (privates Fenster): Hinweis kommt dann eben wieder
  }
};

/** Zählt Sitzungen (einmal je Browser-Sitzung). */
export function countSession() {
  try {
    if (window.sessionStorage.getItem(SESSIONS)) return;
    window.sessionStorage.setItem(SESSIONS, '1');
    write(SESSIONS, String(Number(read(SESSIONS) ?? '0') + 1));
  } catch {
    // ohne Speicher keine Zählung
  }
}

/** Als App vom Home-Bildschirm geöffnet (nur im Browser aufrufen). */
export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export interface InstallState {
  /** Hinweis überhaupt sinnvoll (nicht installiert, Browser kann es). */
  available: boolean;
  /** iOS: Anleitung statt Knopf. */
  ios: boolean;
  dismissed: boolean;
  /** Einmaliger Hinweis nach der zweiten Sitzung fällig. */
  dueOnce: boolean;
  install: () => Promise<void>;
  dismiss: () => void;
  markShown: () => void;
}

export function useInstall(): InstallState {
  const [, setTick] = useState(0);
  const [env, setEnv] = useState({ ios: false, standalone: true, dismissed: true, dueOnce: false });
  useEffect(() => {
    const update = () => setTick((n) => n + 1);
    listeners.add(update);
    setEnv({
      ios: isIos(),
      standalone: isStandalone(),
      dismissed: read(DISMISSED) === '1',
      dueOnce: Number(read(SESSIONS) ?? '0') >= 2 && read(SHOWN_ONCE) !== '1',
    });
    return () => {
      listeners.delete(update);
    };
  }, []);
  const available = !env.standalone && (deferred !== null || env.ios);
  return {
    available,
    ios: env.ios && deferred === null,
    dismissed: env.dismissed,
    dueOnce: available && !env.dismissed && env.dueOnce,
    install: async () => {
      if (!deferred) return;
      await deferred.prompt();
      await deferred.userChoice.catch(() => undefined);
      deferred = null;
      notify();
    },
    dismiss: () => {
      write(DISMISSED, '1');
      setEnv((e) => ({ ...e, dismissed: true }));
    },
    markShown: () => write(SHOWN_ONCE, '1'),
  };
}
