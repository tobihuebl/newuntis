import { Inject, Injectable } from '@nestjs/common';
import { tenantSettingsSchema } from '@sp/shared';
import { ENV, type Env } from '../../config/env';
import type { TenantInfo } from '../../common/request';
import { PrismaService } from '../prisma/prisma.service';

const CACHE_MS = 60_000;

@Injectable()
export class TenantService {
  private readonly cache = new Map<string, { at: number; value: TenantInfo | null }>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** `demo.localhost` mit BASE_DOMAIN `localhost` -> Schule `demo`. Der Mandant kommt nie vom Client-Parameter. */
  slugFromHost(hostname: string): string | null {
    const host = hostname.toLowerCase().split(':')[0] ?? '';
    const suffix = `.${this.env.BASE_DOMAIN.toLowerCase()}`;
    if (!host.endsWith(suffix)) return null;
    const slug = host.slice(0, -suffix.length);
    return /^[a-z0-9][a-z0-9-]{0,62}$/.test(slug) ? slug : null;
  }

  /** Nach einer Änderung der Einstellungen: nächste Anfrage liest neu (andere Instanzen nach spätestens 60 s). */
  invalidate(slug: string): void {
    this.cache.delete(slug);
  }

  async resolve(hostname: string): Promise<TenantInfo | null> {
    const slug = this.slugFromHost(hostname);
    if (!slug) return null;
    const hit = this.cache.get(slug);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
    const row = await this.prisma.client.tenant.findUnique({ where: { slug } });
    const value: TenantInfo | null = row
      ? {
          id: row.id,
          slug: row.slug,
          name: row.name,
          settings: tenantSettingsSchema.parse(row.settings),
        }
      : null;
    this.cache.set(slug, { at: Date.now(), value });
    return value;
  }
}
