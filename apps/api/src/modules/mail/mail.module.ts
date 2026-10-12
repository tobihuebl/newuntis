import { Global, Module } from '@nestjs/common';
import { CryptoService } from '../auth/crypto.service';
import { MailQueue } from './mail-queue.service';
import { MailService } from './mail.service';

@Global()
@Module({ providers: [MailService, MailQueue, CryptoService], exports: [MailService, MailQueue] })
export class MailModule {}
