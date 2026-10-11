import { Injectable } from '@nestjs/common';
import * as OTPAuth from 'otpauth';

@Injectable()
export class TotpService {
  generateSecret(): string {
    return new OTPAuth.Secret({ size: 20 }).base32;
  }

  uri(secret: string, accountEmail: string, issuer: string): string {
    return this.totp(secret, accountEmail, issuer).toString();
  }

  /** Erlaubt eine Zeitscheibe Abweichung (30 s) in beide Richtungen. */
  verify(secret: string, code: string): boolean {
    return (
      this.totp(secret, 'konto', 'Schulplattform').validate({ token: code, window: 1 }) !== null
    );
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
