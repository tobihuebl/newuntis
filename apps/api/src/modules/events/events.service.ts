import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { Tx } from '@sp/db';
import type { EventType, ServerEvent } from '@sp/shared';
import { Client } from 'pg';
import { ENV, type Env } from '../../config/env';

const CHANNEL = 'sp_events';
const BUFFER_SIZE = 2000;
const RECONNECT_MS = 5000;
const MAX_PAYLOAD = 7500;

/** Was über NOTIFY läuft: Mandant, Typ, Ids und optional die Empfänger (sonst die ganze Schule). */
interface Envelope {
  tenantId: string;
  type: EventType;
  ids: string[];
  personIds?: string[];
}

interface Delivered extends Envelope {
  seq: number;
}

export interface Subscriber {
  tenantId: string;
  personId: string;
  send: (id: string, event: ServerEvent) => void;
}

/**
 * Echtzeit-Hinweise (Spec Abschnitt 9): Fachmodule rufen `emit` innerhalb ihrer Transaktion auf.
 * `pg_notify` wird erst beim Commit zugestellt, abgebrochene Änderungen erzeugen also kein Ereignis,
 * und mehrere API-Instanzen bekommen alle Ereignisse. Jede Instanz hält einen Ringpuffer für `Last-Event-ID`.
 */
@Injectable()
export class EventsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(EventsService.name);
  private readonly subscribers = new Set<Subscriber>();
  private readonly buffer: Delivered[] = [];
  /** Ids sind "<Startzeit der Instanz>-<laufende Nummer>"; nach einem Neustart passt eine alte Id nicht mehr. */
  private readonly epoch = Date.now().toString(36);
  private seq = 0;
  private listener: Client | null = null;
  private stopping = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(@Inject(ENV) private readonly env: Env) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.EVENTS_ENABLED === 'false') return;
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    await this.listener?.end().catch(() => undefined);
  }

  /** Ereignis zur Zustellung nach dem Commit der Transaktion vormerken. */
  async emit(
    tx: Tx,
    tenantId: string,
    type: EventType,
    ids: string[],
    personIds?: string[],
  ): Promise<void> {
    let envelope: Envelope = { tenantId, type, ids, ...(personIds ? { personIds } : {}) };
    // NOTIFY-Nutzlast ist auf 8000 Byte begrenzt: bei großen Empfängerkreisen an die ganze Schule
    // (nur Ids, kein Inhalt), bei sehr vielen Ids als "resync"
    if (JSON.stringify(envelope).length > MAX_PAYLOAD) envelope = { tenantId, type, ids };
    if (JSON.stringify(envelope).length > MAX_PAYLOAD)
      envelope = { tenantId, type: 'resync', ids: [] };
    await tx.$executeRaw`SELECT pg_notify(${CHANNEL}, ${JSON.stringify(envelope)})`;
  }

  /** Meldet einen Stream an; mit `lastEventId` werden verpasste Ereignisse nachgeliefert (oder "resync"). */
  subscribe(sub: Subscriber, lastEventId?: string): () => void {
    if (lastEventId) {
      const [epoch, n] = lastEventId.split('-');
      const last = Number.parseInt(n ?? '', 10);
      const oldest = this.buffer[0]?.seq ?? this.seq + 1;
      if (epoch !== this.epoch || Number.isNaN(last) || last < oldest - 1) {
        sub.send(this.id(this.seq), { type: 'resync', ids: [] });
      } else {
        for (const e of this.buffer) if (e.seq > last && this.matches(sub, e)) this.deliver(sub, e);
      }
    }
    this.subscribers.add(sub);
    return () => this.subscribers.delete(sub);
  }

  get connections(): number {
    return this.subscribers.size;
  }

  private id(seq: number): string {
    return `${this.epoch}-${seq}`;
  }

  private matches(sub: Subscriber, e: Envelope): boolean {
    return sub.tenantId === e.tenantId && (!e.personIds || e.personIds.includes(sub.personId));
  }

  private deliver(sub: Subscriber, e: Delivered): void {
    try {
      sub.send(this.id(e.seq), { type: e.type, ids: e.ids });
    } catch {
      this.subscribers.delete(sub);
    }
  }

  private dispatch(e: Envelope): void {
    const d: Delivered = { ...e, seq: ++this.seq };
    this.buffer.push(d);
    if (this.buffer.length > BUFFER_SIZE) this.buffer.shift();
    for (const sub of this.subscribers) if (this.matches(sub, d)) this.deliver(sub, d);
  }

  private async connect(): Promise<void> {
    const client = new Client({ connectionString: this.env.DATABASE_APP_URL });
    client.on('notification', (msg) => {
      if (msg.channel !== CHANNEL || !msg.payload) return;
      try {
        this.dispatch(JSON.parse(msg.payload) as Envelope);
      } catch {
        this.logger.warn('Ungültiges Ereignis verworfen');
      }
    });
    const lost = () => {
      if (this.listener !== client) return;
      this.listener = null;
      if (this.stopping) return;
      this.logger.warn('Verbindung für Ereignisse verloren, neuer Versuch folgt');
      this.reconnectTimer = setTimeout(() => void this.connect(), RECONNECT_MS);
    };
    client.on('error', lost);
    client.on('end', lost);
    try {
      await client.connect();
      await client.query(`LISTEN ${CHANNEL}`);
      const reconnected = this.seq > 0 || this.subscribers.size > 0;
      this.listener = client;
      // Während der Unterbrechung können Ereignisse verloren gegangen sein: Clients sollen neu laden.
      if (reconnected)
        for (const sub of this.subscribers)
          sub.send(this.id(this.seq), { type: 'resync', ids: [] });
    } catch (err) {
      this.logger.error(
        `Ereignisse nicht verfügbar: ${err instanceof Error ? err.message : 'unbekannt'}`,
      );
      await client.end().catch(() => undefined);
      if (!this.stopping) this.reconnectTimer = setTimeout(() => void this.connect(), RECONNECT_MS);
    }
  }
}
