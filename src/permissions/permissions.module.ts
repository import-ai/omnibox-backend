import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionsService } from './permissions.service';
import { Permission } from './permissions.entity';
import { PermissionsController } from './permissions.controller';

@Module({
  providers: [PermissionsService],
  controllers: [PermissionsController],
  exports: [PermissionsService],
  imports: [TypeOrmModule.forFeature([Permission])],
})
export class PermissionsModule {}
