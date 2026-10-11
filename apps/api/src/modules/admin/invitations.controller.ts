import { Body, Controller, Post, Req } from '@nestjs/common';
import { invitationsInput } from '@sp/shared';
import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { Can, NoTransaction } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { InvitationsService } from './invitations.service';

@Controller('admin/invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Can('masterdata.write')
  @NoTransaction() // die Einladung legt der AuthService in eigenen Transaktionen an, E-Mails gehen erst danach raus
  @Post()
  send(
    @Req() req: FastifyRequest,
    @Body(new ZodPipe(invitationsInput)) body: z.infer<typeof invitationsInput>,
  ) {
    return this.invitations.invite(req.tenant!, req.principal!.personId, body.personIds);
  }
}
