'use client';
import * as React from 'react';
import { Check, type LucideIcon } from 'lucide-react';
import { cn } from '../cn';

export interface ToastOptions {
  /** Perfekt oder Zustand ("Eintrag gespeichert"), ohne Ausrufezeichen. */
  text: string;
  icon?: LucideIcon;
  /** Optional eine Aktion, meist "Rückgängig". */
  action?: { label: string; onClick: () => void };
}

interface ToastState extends ToastOptions {
  id: number;
}

const ToastContext = React.createContext<((t: ToastOptions) => void) | null>(null);

/** Dauer eines Toasts (Design System: 5 Sekunden). */
const DURATION = 5000;

/**
 * Toast (Design System, pf-toast): bestätigt kurz und bietet Rückgängig an. Nachtfläche, role="status", immer nur
 * einer; mobil über der Tab-Leiste, ab 1024 px unter der Kopfzeile. Fehler nie nur als Toast.
 */
export function ToastProvider({
  children,
  viewportClassName,
}: {
  children: React.ReactNode;
  viewportClassName?: string;
}) {
  const [toast, setToast] = React.useState<ToastState | null>(null);
  const counter = React.useRef(0);

  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), DURATION);
    return () => clearTimeout(t);
  }, [toast]);

  const show = React.useCallback((t: ToastOptions) => {
    counter.current += 1;
    setToast({ ...t, id: counter.current });
  }, []);

  const Icon = toast?.icon ?? Check;
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className={cn(
          'pointer-events-none fixed inset-x-0 z-toast flex justify-center px-4',
          'bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+var(--space-3))]',
          'lg:top-[calc(var(--topbar-h)+var(--space-3))] lg:right-6 lg:bottom-auto lg:left-auto lg:justify-end',
          viewportClassName,
        )}
      >
        {toast ? (
          <div key={toast.id} className="pf-toast pointer-events-auto max-w-130 animate-toast-in">
            <Icon aria-hidden="true" />
            <span className="min-w-0 flex-1">{toast.text}</span>
            {toast.action ? (
              <button
                type="button"
                className="pf-toast__action"
                onClick={() => {
                  toast.action?.onClick();
                  setToast(null);
                }}
              >
                {toast.action.label}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}

/** Zeigt einen Toast; außerhalb eines ToastProvider ohne Wirkung. */
export function useToast(): (t: ToastOptions) => void {
  return React.useContext(ToastContext) ?? noop;
}

function noop() {}
