import { Module } from '@nestjs/common';
import { GradesModule } from '../grades/grades.module';
import { TransitionController } from './transition.controller';
import { TransitionService } from './transition.service';

/** Schuljahreswechsel (SD-05, ADR 0019). */
@Module({
  imports: [GradesModule],
  controllers: [TransitionController],
  providers: [TransitionService],
})
export class TransitionModule {}
