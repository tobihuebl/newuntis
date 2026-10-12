import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Check } from 'lucide-react';
import { Button } from './button';
import { Chip } from './chip';
import { EmptyState } from './empty-state';
import { Input } from './input';
import { KpiTile } from './kpi-tile';
import { Logo } from './logo';
import { Skeleton } from './skeleton';
import { StatusBadge } from './status-badge';
import { ToastProvider, useToast } from './toast';
import { cn } from '../cn';

describe('Button', () => {
  it('rendert als button mit type="button" und den pf-Klassen des Design Systems', () => {
    render(<Button>Speichern</Button>);
    const b = screen.getByRole('button', { name: 'Speichern' });
    expect(b).toHaveAttribute('type', 'button');
    expect(b).toHaveClass('pf-btn', 'pf-btn--primary');
  });
  it('sperrt im Ladezustand und meldet aria-busy', () => {
    render(
      <Button variant="secondary" loading>
        Senden
      </Button>,
    );
    const b = screen.getByRole('button', { name: 'Senden' });
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute('aria-busy', 'true');
    expect(b).toHaveClass('pf-btn--secondary');
  });
});

describe('Button als Link', () => {
  it('setzt das Icon in das Kind-Element (asChild)', () => {
    render(
      <Button asChild iconLeft={Check}>
        <a href="/klassenbuch">Klassenbuch öffnen</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Klassenbuch öffnen' });
    expect(link).toHaveClass('pf-btn');
    expect(link.querySelector('svg')).not.toBeNull();
  });
});

describe('Input', () => {
  it('verknüpft Beschriftung, Hilfetext und Fehlermeldung mit dem Feld', () => {
    render(
      <Input label="E-Mail" hint="Adresse der Schule" error="Bitte eine E-Mail-Adresse angeben." />,
    );
    const field = screen.getByLabelText('E-Mail');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription(
      'Adresse der Schule Bitte eine E-Mail-Adresse angeben.',
    );
    expect(field).toHaveClass('pf-input');
  });
});

describe('Chip und StatusBadge', () => {
  it('zeigt Text und Icon, nicht nur Farbe', () => {
    const { container } = render(<StatusBadge status="cancelled" label="Entfall" />);
    expect(screen.getByText('Entfall')).toHaveClass('line-through');
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
  it('bildet abwesend neutral und Vertretung als ok ab (Rot nur für Fehler)', () => {
    render(
      <>
        <StatusBadge status="absent" label="Abwesend" />
        <StatusBadge status="substituted" label="Vertretung" />
      </>,
    );
    expect(screen.getByText('Abwesend').closest('.pf-chip')).toHaveClass('pf-chip--absent');
    expect(screen.getByText('Vertretung').closest('.pf-chip')).toHaveClass('pf-chip--ok');
  });
  it('setzt die Tonart als Klasse', () => {
    render(<Chip tone="mono">08:00</Chip>);
    expect(screen.getByText('08:00')).toHaveClass('pf-chip', 'pf-chip--mono');
  });
});

describe('KpiTile', () => {
  it('liest Zahl und Wort als ein Element vor und wird mit href zum Link', () => {
    render(<KpiTile value={3} label="Supplierungen" href="/supplierung" />);
    expect(screen.getByRole('link', { name: '3 Supplierungen' })).toHaveAttribute(
      'href',
      '/supplierung',
    );
  });
});

describe('EmptyState', () => {
  it('zeigt Kachel-Raster (dekorativ) und Titel', () => {
    const { container } = render(<EmptyState title="Heute keine Supplierungen" />);
    expect(screen.getByRole('heading', { name: 'Heute keine Supplierungen' })).toBeInTheDocument();
    expect(container.querySelector('.pf-empty__tiles')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('Logo', () => {
  it('schreibt den Namen PROfessor und hat zehn Kacheln mit einer Amber-Kachel', () => {
    const { container } = render(<Logo />);
    expect(container.textContent).toBe('PROfessor');
    expect(container.querySelectorAll('rect')).toHaveLength(10);
    expect(container.querySelectorAll('rect.fill-signal')).toHaveLength(1);
  });
  it('ist als reines Symbol ein Bild mit Namen', () => {
    render(<Logo symbolOnly />);
    expect(screen.getByRole('img', { name: 'PROfessor' })).toBeInTheDocument();
  });
});

describe('Skeleton und Toast (Zeitverhalten)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('Skeleton erscheint erst nach 1 s', () => {
    const { container } = render(<Skeleton className="h-14" />);
    expect(container.firstChild).toHaveClass('invisible');
    act(() => vi.advanceTimersByTime(1000));
    expect(container.firstChild).not.toHaveClass('invisible');
  });

  it('Toast meldet sich als Status, bietet Rückgängig an und verschwindet nach 5 s', () => {
    const undo = vi.fn();
    function Trigger() {
      const toast = useToast();
      return (
        <button
          type="button"
          onClick={() =>
            toast({ text: 'Eintrag gespeichert', action: { label: 'Rückgängig', onClick: undo } })
          }
        >
          auslösen
        </button>
      );
    }
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('auslösen'));
    expect(screen.getByRole('status')).toHaveTextContent('Eintrag gespeichert');
    fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
    expect(undo).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByText('auslösen'));
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
});

describe('cn', () => {
  it('hält Schriftstil und Textfarbe auseinander', () => {
    expect(cn('text-body-sm text-ink-muted', 'text-ink')).toBe('text-body-sm text-ink');
    expect(cn('text-h1', 'text-h3')).toBe('text-h3');
  });
});
