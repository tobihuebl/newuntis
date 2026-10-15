import { Module } from '@nestjs/common';
import { ConsentFormsController } from './consent-forms.controller';
import { ConsentFormsService } from './consent-forms.service';

/** Einverständniserklärungen (KO-05, ADR 0021). */
@Module({ controllers: [ConsentFormsController], providers: [ConsentFormsService] })
export class ConsentFormsModule {}
