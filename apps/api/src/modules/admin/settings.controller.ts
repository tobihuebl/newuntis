import { Body, Controller, Get, Patch } from '@nestjs/common';
import type { Prisma } from '@sp/db';
import { tenantSettingsPatch, tenantSettingsSchema, type TenantSettings } from '@sp/shared';
import type { z } from 'zod';
import { Can } from '../../common/decorators';
import { Actor, TenantId } from '../../common/params';
import type { Principal } from '../../common/request';
import { ZodPipe } from '../../common/zod.pipe';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenants/tenant.service';

/**
 * Schuleinstellungen (Fristen, Grenzwerte, Aufbewahrung, Spec Abschnitt 1 und 13): pro Schule konfigurierbar.
 * Lesen: Direktion und Administration; Ändern: Administration. Gespeichert über update_tenant_settings().
 */
@Controller('admin/settings')
export class SettingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantService,
    private readonly audit: AuditService,
  ) {}

  /** "Tenant" hat keine Row-Level-Security (alle Schulen lesbar): immer über die Id des Mandanten. */
  private async current(tenantId: string): Promise<{ settings: TenantSettings; slug: string }> {
    const t = await this.prisma.tx.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { settings: true, slug: true },
    });
    return { settings: tenantSettingsSchema.parse(t.settings), slug: t.slug };
  }

  @Can('masterdata.read')
  @Get()
  async get(@TenantId() tenantId: string): Promise<TenantSettings> {
    return (await this.current(tenantId)).settings;
  }

  @Can('masterdata.write')
  @Patch()
  async patch(
    @TenantId() tenantId: string,
    @Actor() me: Principal,
    @Body(new ZodPipe(tenantSettingsPatch)) body: z.infer<typeof tenantSettingsPatch>,
  ): Promise<TenantSettings> {
    const { settings, slug } = await this.current(tenantId);
    const next = tenantSettingsSchema.parse({ ...settings, ...body });
    await this.prisma.tx.$executeRaw`SELECT update_tenant_settings(${JSON.stringify(next)}::jsonb)`;
    this.tenants.invalidate(slug);
    await this.audit.record({
      tenantId,
      actorId: me.personId,
      action: 'settings.update',
      entity: 'tenant',
      entityId: tenantId,
      meta: { sections: Object.keys(body) } as Prisma.InputJsonValue,
    });
    return next;
  }
}
