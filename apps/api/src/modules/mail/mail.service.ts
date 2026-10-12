import { Inject, Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { ENV, type Env } from '../../config/env';
import { MetricsService } from '../metrics/metrics.service';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** SMTP eines EU-Anbieters (lokal: Mailpit). Inhalte entstehen aus den React-Email-Vorlagen (templates.tsx). */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Transporter;

  constructor(
    @Inject(ENV) env: Env,
    private readonly metrics: MetricsService,
  ) {
    this.transport = createTransport(env.SMTP_URL);
  }

  /** `throwOnError`: im Job, damit pg-boss mit steigendem Abstand wiederholt. */
  async send(mail: Mail, { throwOnError = false } = {}): Promise<void> {
    try {
      await this.transport.sendMail({
        from: 'Schulplattform <noreply@schulplattform.invalid>',
        ...mail,
      });
      this.metrics.inc('sp_mail_total', 'E-Mail-Versand', { result: 'sent' });
    } catch (err) {
      this.metrics.inc('sp_mail_total', 'E-Mail-Versand', { result: 'failed' });
      // Keine Empfängeradresse im Log (personenbezogen).
      this.logger.error(
        `E-Mail-Versand fehlgeschlagen: ${err instanceof Error ? err.message : 'unbekannt'}`,
      );
      if (throwOnError) throw err;
    }
  }
}
