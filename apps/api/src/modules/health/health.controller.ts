import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { NoTenant } from '../../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

@NoTenant()
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness: der Prozess läuft. */
  @Get('healthz')
  healthz() {
    return { status: 'ok' };
  }

  /** Readiness: Abhängigkeiten (Datenbank) erreichbar. */
  @Get('readyz')
  async readyz() {
    try {
      await this.prisma.client.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ status: 'unavailable', database: 'down' });
    }
    return { status: 'ok', database: 'up' };
  }
}
