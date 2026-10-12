import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditController } from './audit.controller';
import { ClassesController } from './classes.controller';
import { GuardiansController } from './guardians.controller';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { PersonsController } from './persons.controller';
import { SchoolController } from './school.controller';
import { SettingsController } from './settings.controller';
import { RolesController } from './roles.controller';

@Module({
  imports: [AuthModule],
  controllers: [
    SchoolController,
    ClassesController,
    PersonsController,
    GuardiansController,
    InvitationsController,
    ImportController,
    AuditController,
    SettingsController,
    RolesController,
  ],
  providers: [ImportService, InvitationsService],
})
export class AdminModule {}
