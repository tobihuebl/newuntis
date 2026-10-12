import { Inject, Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { ENV, type Env } from '../../config/env';

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

  constructor(@Inject(ENV) env: Env) {
    this.transport = createTransport(env.SMTP_URL);
  }

  /** `throwOnError`: im Job, damit pg-boss mit steigendem Abstand wiederholt. */
  async send(mail: Mail, { throwOnError = false } = {}): Promise<void> {
    try {
      await this.transport.sendMail({
        from: 'Schulplattform <noreply@schulplattform.invalid>',
        ...mail,
      });
    } catch (err) {
      // Keine Empfängeradresse im Log (personenbezogen).
      this.logger.error(
        `E-Mail-Versand fehlgeschlagen: ${err instanceof Error ? err.message : 'unbekannt'}`,
      );
      if (throwOnError) throw err;
    }
  }
}
