import { Global, Module } from '@nestjs/common';
import { FilesService, ObjectStore, VirusScanner } from './files.service';

@Global()
@Module({ providers: [FilesService, ObjectStore, VirusScanner], exports: [FilesService] })
export class FilesModule {}
