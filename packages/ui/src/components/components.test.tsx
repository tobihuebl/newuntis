import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './button';
import { Input } from './input';
import { StatusBadge } from './status-badge';

describe('Button', () => {
  it('rendert als button mit type="button" und mindestens 44 px Tap-Fläche', () => {
    render(<Button>Speichern</Button>);
    const b = screen.getByRole('button', { name: 'Speichern' });
    expect(b).toHaveAttribute('type', 'button');
    expect(b.className).toContain('min-h-11');
  });
});

describe('Input', () => {
  it('verknüpft Beschriftung und Fehlermeldung mit dem Feld', () => {
    render(<Input label="E-Mail" error="Ungültig" />);
    const field = screen.getByLabelText('E-Mail');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription('Ungültig');
  });
});

describe('StatusBadge', () => {
  it('zeigt Text und Icon, nicht nur Farbe', () => {
    const { container } = render(<StatusBadge status="cancelled" label="Entfall" />);
    expect(screen.getByText('Entfall')).toHaveClass('line-through');
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
