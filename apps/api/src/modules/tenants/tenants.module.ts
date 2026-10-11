import { Global, Module } from '@nestjs/common';
import { TenantGuard } from './tenant.guard';
import { TenantService } from './tenant.service';

@Global()
@Module({ providers: [TenantService, TenantGuard], exports: [TenantService, TenantGuard] })
export class TenantsModule {}
