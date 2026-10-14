import { Module } from '@nestjs/common';
import { GradesController } from './grades.controller';
import { GradesService } from './grades.service';

/** Noten (PN-02, ADR 0018). */
@Module({ controllers: [GradesController], providers: [GradesService] })
export class GradesModule {}
