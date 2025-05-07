import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionsService } from './permissions.service';
import { Permission } from './permissions.entity';

@Module({
  providers: [PermissionsService],
  exports: [PermissionsService],
  imports: [TypeOrmModule.forFeature([Permission])],
})
export class PermissionsModule {}
