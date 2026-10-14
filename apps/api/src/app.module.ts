import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ProblemFilter } from './common/problem.filter';
import { RateLimitGuard } from './common/rate-limit.guard';
import { AdminModule } from './modules/admin/admin.module';
import { AbsencesModule } from './modules/absences/absences.module';
import { SubstitutionsModule } from './modules/substitutions/substitutions.module';
import { ExamsModule } from './modules/exams/exams.module';
import { MessagesModule } from './modules/messages/messages.module';
import { ReportsModule } from './modules/reports/reports.module';
import { PrivacyModule } from './modules/privacy/privacy.module';
import { MetricsCoreModule } from './modules/metrics/metrics.service';
import { MetricsController } from './modules/metrics/metrics.controller';
import { ClassbookModule } from './modules/classbook/classbook.module';
import { EventsModule } from './modules/events/events.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { QueueModule } from './modules/jobs/queue.module';
import { MailModule } from './modules/mail/mail.module';
import { FilesModule } from './modules/files/files.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { TimetableModule } from './modules/timetable/timetable.module';
import { PlanningModule } from './modules/planning/planning.module';
import { SearchModule } from './modules/search/search.module';
import { GradesModule } from './modules/grades/grades.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthGuard } from './modules/auth/auth.guard';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { PolicyModule } from './modules/policy/policy.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { TenantTransactionInterceptor } from './modules/prisma/tenant-transaction.interceptor';
import { TenantGuard } from './modules/tenants/tenant.guard';
import { TenantsModule } from './modules/tenants/tenants.module';

@Module({
  imports: [
    MetricsCoreModule,
    PrismaModule,
    QueueModule,
    MailModule,
    FilesModule,
    TenantsModule,
    AuditModule,
    PolicyModule,
    AuthModule,
    AdminModule,
    TimetableModule,
    PlanningModule,
    SearchModule,
    GradesModule,
    EventsModule,
    NotificationsModule,
    AbsencesModule,
    SubstitutionsModule,
    ExamsModule,
    MessagesModule,
    ReportsModule,
    PrivacyModule,
    ClassbookModule,
    JobsModule,
    HealthModule,
  ],
  controllers: [MetricsController],
  providers: [
    // Reihenfolge ist wesentlich: erst Mandant, dann Ratenbegrenzung, dann Anmeldung und Rechte.
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantTransactionInterceptor },
    { provide: APP_FILTER, useClass: ProblemFilter },
  ],
})
export class AppModule {}
