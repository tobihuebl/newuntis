# Kontrast der Farb-Tokens

Erzeugt von `scripts/check-contrast.mjs` aus `docs/design-system/tokens.json` (nicht von Hand ändern).
Paare laut den Hinweisen der Tokens; Mindestwerte nach WCAG 2.2 AA: Text 4.5:1, Bedienelemente und Fokusring 3:1.
Auf Nachtflächen gilt im hellen Theme Amber als Fokusring (Hinweis zu `focus`).

| Vordergrund | Hintergrund | Mindestwert | Hell | Dunkel |
| --- | --- | --- | --- | --- |
| `ink` | `bg` | 4.5:1 | 16.10 ok | 16.10 ok |
| `ink` | `bg-raised` | 4.5:1 | 17.56 ok | 14.20 ok |
| `ink` | `bg-sunken` | 4.5:1 | 14.48 ok | 17.01 ok |
| `ink` | `brand-soft` | 4.5:1 | 14.50 ok | 11.79 ok |
| `ink` | `signal-soft` | 4.5:1 | 15.54 ok | 12.43 ok |
| `ink` | `neutral-soft` | 4.5:1 | 14.30 ok | 11.57 ok |
| `ink-muted` | `bg` | 4.5:1 | 6.77 ok | 8.53 ok |
| `ink-muted` | `bg-raised` | 4.5:1 | 7.39 ok | 7.52 ok |
| `ink-muted` | `bg-sunken` | 4.5:1 | 6.09 ok | 9.01 ok |
| `ink-muted` | `neutral-soft` | 4.5:1 | 6.01 ok | 6.13 ok |
| `ink-subtle` | `bg` | 4.5:1 | 5.12 ok | 5.70 ok |
| `ink-subtle` | `bg-raised` | 4.5:1 | 5.59 ok | 5.03 ok |
| `ink-on-night` | `bg-night` | 4.5:1 | 16.10 ok | 12.74 ok |
| `ink-on-night` | `bg-night-raised` | 4.5:1 | 14.20 ok | 10.72 ok |
| `ink-on-night-muted` | `bg-night` | 4.5:1 | 9.94 ok | 7.86 ok |
| `ink-on-night-muted` | `bg-night-raised` | 4.5:1 | 8.76 ok | 6.62 ok |
| `on-brand` | `brand` | 4.5:1 | 5.93 ok | 4.64 ok |
| `on-brand` | `brand-hover` | 4.5:1 | 7.66 ok | 5.65 ok |
| `brand-text` | `bg` | 4.5:1 | 6.66 ok | 7.58 ok |
| `brand-text` | `bg-raised` | 4.5:1 | 7.26 ok | 6.69 ok |
| `brand-text` | `brand-soft` | 4.5:1 | 6.00 ok | 5.56 ok |
| `on-signal` | `signal` | 4.5:1 | 8.49 ok | 8.49 ok |
| `signal-ink` | `signal-soft` | 4.5:1 | 5.65 ok | 6.55 ok |
| `on-danger` | `danger` | 4.5:1 | 4.60 ok | 6.90 ok |
| `danger-ink` | `danger-soft` | 4.5:1 | 5.49 ok | 7.00 ok |
| `on-fach` | `fach-kobalt` | 4.5:1 | 7.58 ok | 7.58 ok |
| `on-fach` | `fach-mint` | 4.5:1 | 7.96 ok | 7.96 ok |
| `on-fach` | `fach-himmel` | 4.5:1 | 9.23 ok | 9.23 ok |
| `on-fach` | `fach-flieder` | 4.5:1 | 7.71 ok | 7.71 ok |
| `on-fach` | `fach-rosa` | 4.5:1 | 8.26 ok | 8.26 ok |
| `on-fach` | `fach-limette` | 4.5:1 | 11.85 ok | 11.85 ok |
| `on-fach` | `fach-koralle` | 4.5:1 | 6.90 ok | 6.90 ok |
| `on-fach` | `fach-sand` | 4.5:1 | 11.89 ok | 11.89 ok |
| `ink-subtle` | `bg-sunken` | 4.5:1 (leere Kachel) | 4.61 ok | 6.02 ok |
| `ink-muted` | `brand-soft` | 4.5:1 (Zusatztext in Hinweisen) | 6.10 ok | 6.25 ok |
| `ink-muted` | `signal-soft` | 4.5:1 (Zusatztext in Hinweisen) | 6.54 ok | 6.59 ok |
| `ink-muted` | `danger-soft` | 4.5:1 (Zusatztext in Hinweisen) | 6.11 ok | 6.87 ok |
| `brand-text` | `bg-sunken` | 4.5:1 (Links in Tracks) | 5.99 ok | 8.01 ok |
| `line-strong` | `bg` | 3:1 (Rand von Bedienelementen) | 3.52 ok | 3.57 ok |
| `line-strong` | `bg-raised` | 3:1 (Rand von Bedienelementen) | 3.85 ok | 3.14 ok |
| `brand` | `bg` | 3:1 (Primärbutton-Fläche) | 5.44 ok | 3.79 ok |
| `brand` | `bg-raised` | 3:1 (Primärbutton-Fläche) | 5.93 ok | 3.34 ok |
| `focus` | `bg` | 3:1 (Fokusring) | 5.44 ok | 8.49 ok |
| `focus` | `bg-raised` | 3:1 (Fokusring) | 5.93 ok | 7.48 ok |
| `signal` | `bg-night` | 3:1 (Fokusring auf Nachtflächen) | 8.49 ok | – |
| `focus` | `bg-night` | 3:1 (Fokusring auf Nachtflächen) | – | 6.71 ok |

Ergebnis: alle Paare bestehen.
