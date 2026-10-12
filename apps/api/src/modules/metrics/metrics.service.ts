import { Global, Injectable, Module } from '@nestjs/common';

type Labels = Record<string, string>;

/**
 * Einfache Zähler im Prometheus-Textformat (Spec Abschnitt 13, Überwachung). Labels nie mit Personendaten,
 * Pfaden oder Ids: nur feste Werte wie Statusklasse, Kanal oder Ergebnis.
 */
@Injectable()
export class MetricsService {
  private readonly counters = new Map<string, { help: string; values: Map<string, number> }>();
  private readonly startedAt = Date.now();

  inc(name: string, help: string, labels: Labels = {}, by = 1): void {
    const c = this.counters.get(name) ?? { help, values: new Map<string, number>() };
    const key = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v.replace(/["\\\n]/g, '_')}"`)
      .join(',');
    c.values.set(key, (c.values.get(key) ?? 0) + by);
    this.counters.set(name, c);
  }

  render(gauges: { name: string; help: string; values: [Labels, number][] }[] = []): string {
    const lines: string[] = [];
    const series = (name: string, key: string, v: number) =>
      lines.push(`${name}${key ? `{${key}}` : ''} ${v}`);
    for (const [name, c] of this.counters) {
      lines.push(`# HELP ${name} ${c.help}`, `# TYPE ${name} counter`);
      for (const [key, v] of c.values) series(name, key, v);
    }
    lines.push('# HELP sp_uptime_seconds Laufzeit des Prozesses', '# TYPE sp_uptime_seconds gauge');
    series('sp_uptime_seconds', '', Math.round((Date.now() - this.startedAt) / 1000));
    for (const g of gauges) {
      lines.push(`# HELP ${g.name} ${g.help}`, `# TYPE ${g.name} gauge`);
      for (const [labels, v] of g.values)
        series(
          g.name,
          Object.entries(labels)
            .map(([k, x]) => `${k}="${x}"`)
            .join(','),
          v,
        );
    }
    return `${lines.join('\n')}\n`;
  }
}

@Global()
@Module({ providers: [MetricsService], exports: [MetricsService] })
export class MetricsCoreModule {}
