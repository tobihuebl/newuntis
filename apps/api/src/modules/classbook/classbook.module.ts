import { Module } from '@nestjs/common';
import { AbsencesModule } from '../absences/absences.module';
import { TimetableModule } from '../timetable/timetable.module';
import { ClassbookController } from './classbook.controller';
import { ClassbookService } from './classbook.service';
import { MyClassesController } from './classes.controller';
import { TodayService } from './today.service';

@Module({
  imports: [TimetableModule, AbsencesModule],
  controllers: [ClassbookController, MyClassesController],
  providers: [ClassbookService, TodayService],
})
export class ClassbookModule {}
