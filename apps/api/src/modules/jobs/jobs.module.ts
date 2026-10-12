import { Module } from '@nestjs/common';
import { TimetableModule } from '../timetable/timetable.module';
import { JobsService } from './jobs.service';

@Module({ imports: [TimetableModule], providers: [JobsService] })
export class JobsModule {}
