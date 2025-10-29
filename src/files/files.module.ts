import { Module } from '@nestjs/common';
import { FilesService } from './files.service';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { File } from './entities/file.entity';
import { FilesController } from './files.controller';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';

@Module({
  imports: [ConfigModule, PermissionsModule, TypeOrmModule.forFeature([File])],
  providers: [FilesService],
  exports: [FilesService],
  controllers: [FilesController],
})
export class FilesModule {}
