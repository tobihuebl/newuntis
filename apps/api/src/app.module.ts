import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ProblemFilter } from './common/problem.filter';
import { RateLimitGuard } from './common/rate-limit.guard';
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
  imports: [PrismaModule, TenantsModule, AuditModule, PolicyModule, AuthModule, HealthModule],
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
