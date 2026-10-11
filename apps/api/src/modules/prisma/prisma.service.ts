import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { createPrisma, type Db } from '@sp/db';

@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly client: Db = createPrisma();

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
