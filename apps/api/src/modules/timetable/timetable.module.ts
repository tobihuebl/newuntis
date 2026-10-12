import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OccurrencesService } from './occurrences.service';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';
import { VersionsController } from './versions.controller';

@Module({
  imports: [AuthModule],
  controllers: [VersionsController, PlansController],
  providers: [OccurrencesService, PlansService],
  exports: [OccurrencesService, PlansService],
})
export class TimetableModule {}
