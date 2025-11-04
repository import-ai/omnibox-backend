import { Module } from '@nestjs/common';
import { FilesService } from './files.service';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { File } from './entities/file.entity';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([File])],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
