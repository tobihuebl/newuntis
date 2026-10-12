import { Injectable } from '@nestjs/common';
import * as OTPAuth from 'otpauth';
import { BRAND } from '@sp/shared';

@Injectable()
export class TotpService {
  generateSecret(): string {
    return new OTPAuth.Secret({ size: 20 }).base32;
  }

  uri(secret: string, accountEmail: string, issuer: string): string {
    return this.totp(secret, accountEmail, issuer).toString();
  }

  /**
   * Zeitscheibe (30 s) des Codes oder null; erlaubt eine Scheibe Abweichung in beide Richtungen.
   * Der Aufrufer speichert die Scheibe, damit ein Code nicht zweimal gilt (Schutz gegen Wiederverwendung).
   */
  counter(secret: string, code: string, now = Date.now()): number | null {
    const delta = this.totp(secret, 'konto', BRAND.name).validate({
      token: code,
      window: 1,
      timestamp: now,
    });
    return delta === null ? null : Math.floor(now / 1000 / 30) + delta;
  }

  private totp(secret: string, label: string, issuer: string): OTPAuth.TOTP {
    return new OTPAuth.TOTP({
      issuer,
      label,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });
  }
}
