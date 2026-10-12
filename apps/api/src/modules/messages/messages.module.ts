import { Global, Module } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import { AnnouncementsController, ThreadsController } from './messages.controller';
import { MessagesService } from './messages.service';

@Global()
@Module({
  controllers: [ThreadsController, AnnouncementsController],
  providers: [MessagesService, AnnouncementsService],
  exports: [MessagesService, AnnouncementsService],
})
export class MessagesModule {}
