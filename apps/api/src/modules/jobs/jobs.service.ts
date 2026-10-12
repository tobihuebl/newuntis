import { Injectable, type OnModuleInit } from '@nestjs/common';
import { OccurrencesService } from '../timetable/occurrences.service';
import { QueueService } from './queue.service';

export const QUEUE_OCCURRENCES = 'generate-occurrences';

/** Termine des gleitenden Fensters: nächtlich um 02:15 Wiener Zeit und einmal beim Start. */
@Injectable()
export class JobsService implements OnModuleInit {
  constructor(
    private readonly queue: QueueService,
    private readonly occurrences: OccurrencesService,
  ) {}

  onModuleInit(): void {
    this.queue.register(QUEUE_OCCURRENCES, () => this.occurrences.generateAllTenants(), {
      cron: '15 2 * * *',
      onStartup: true,
    });
  }
}
