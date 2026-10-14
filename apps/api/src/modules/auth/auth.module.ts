import { Module } from '@nestjs/common';
import { AuthController, MeController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { CryptoService } from './crypto.service';
import { SessionService } from './session.service';
import { TotpService } from './totp.service';
import { OnboardingService } from '../onboarding/onboarding.service';

@Module({
  controllers: [AuthController, MeController],
  providers: [
    AuthService,
    AuthGuard,
    CryptoService,
    SessionService,
    TotpService,
    OnboardingService,
  ],
  exports: [AuthGuard, AuthService, CryptoService, SessionService, OnboardingService],
})
export class AuthModule {}
