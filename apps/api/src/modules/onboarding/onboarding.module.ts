import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AccessCodesController } from './access-codes.controller';
import { OnboardingController } from './onboarding.controller';

/** Onboarding (ADR 0020). OnboardingService liegt im AuthModule, weil /me den Guard-Zustand braucht. */
@Module({
  imports: [AuthModule],
  controllers: [OnboardingController, AccessCodesController],
})
export class OnboardingModule {}
