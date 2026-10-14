import { CircleDot } from 'lucide-react';
import { Card, CardSub, Chip } from '@sp/ui';

/**
 * Nachtkarte der aktuellen (sonst nächsten) Stunde (Design System, Screens "Heute"): die eine starke Fläche der
 * Seite. Overline in Amber, Titel "3B · Mathe", darunter Stunde und Raum, Status als Chip, eine Hauptaktion.
 */
export function NowCard({
  overline,
  title,
  sub,
  status,
  action,
  children,
}: {
  overline: string;
  title: string;
  sub: string;
  /** Status der Stunde, z. B. "Stunde offen" (Amber, der eine Aufmerksamkeitspunkt) oder "Abgeschlossen". */
  status?: { label: string; open: boolean };
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Card tone="night" className="flex flex-col gap-3" data-tour="next">
      <p className="text-overline text-signal">{overline}</p>
      <div>
        <h2 className="text-h2 text-ink-on-night">{title}</h2>
        <CardSub className="text-body">{sub}</CardSub>
      </div>
      {children}
      {status || action ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {status ? (
            <Chip tone={status.open ? 'solid' : 'ok'} icon={CircleDot}>
              {status.label}
            </Chip>
          ) : (
            <span />
          )}
          {action}
        </div>
      ) : null}
    </Card>
  );
}
