import { Module } from '@nestjs/common';
import { AuthController, MeController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { CryptoService } from './crypto.service';
import { MailService } from './mail.service';
import { SessionService } from './session.service';
import { TotpService } from './totp.service';

@Module({
  controllers: [AuthController, MeController],
  providers: [AuthService, AuthGuard, CryptoService, MailService, SessionService, TotpService],
  exports: [AuthGuard, AuthService, CryptoService, SessionService],
})
export class AuthModule {}
