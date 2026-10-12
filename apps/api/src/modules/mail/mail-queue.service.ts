import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Tx } from '@sp/db';
import { CryptoService } from '../auth/crypto.service';
import { QueueService } from '../jobs/queue.service';
import { MailService, type Mail } from './mail.service';
import { renderMail, type MailTemplate } from './templates';

const QUEUE_MAIL = 'mail';

/**
 * Versand über pg-boss mit Wiederholung bei Fehlern. Der Inhalt liegt verschlüsselt im Job, weil
 * Einladungs- und Reset-Links Geheimnisse sind. Ohne laufende Queue (Tests) wird direkt gesendet.
 */
@Injectable()
export class MailQueue implements OnModuleInit {
  private readonly logger = new Logger(MailQueue.name);

  constructor(
    private readonly queue: QueueService,
    private readonly mail: MailService,
    private readonly crypto: CryptoService,
  ) {}

  onModuleInit(): void {
    this.queue.register<{ enc: string }>(
      QUEUE_MAIL,
      async ({ enc }) => {
        await this.mail.send(JSON.parse(this.crypto.decrypt(enc)) as Mail, { throwOnError: true });
      },
      { concurrency: 4 },
    );
  }

  async send(to: string, template: MailTemplate, tx?: Tx): Promise<void> {
    const rendered = await renderMail(template);
    const mail: Mail = { to, ...rendered };
    const id = await this.queue.send(
      QUEUE_MAIL,
      { enc: this.crypto.encrypt(JSON.stringify(mail)) },
      { retryLimit: 5, retryDelay: 30, retryBackoff: true, deleteAfterSeconds: 3600 },
      tx,
    );
    if (id === null) {
      if (this.queue.running) this.logger.warn('E-Mail nicht eingereiht');
      await this.mail.send(mail);
    }
  }
}
