import { Module } from '@nestjs/common';
import { FilesService } from './files.service';
import { ConfigModule } from '@nestjs/config';
import { FilesController } from './files.controller';

@Module({
  imports: [ConfigModule],
  providers: [FilesService],
  controllers: [FilesController],
})
export class FilesModule {}
