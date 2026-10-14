import { Module } from '@nestjs/common';
import { AbsencesController } from './absences.controller';
import { AbsencesService } from './absences.service';
import { AbsenceWarningsService } from './warnings.service';

@Module({
  controllers: [AbsencesController],
  providers: [AbsencesService, AbsenceWarningsService],
  exports: [AbsencesService, AbsenceWarningsService],
})
export class AbsencesModule {}
