import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { ToolbarPreference } from './entities/toolbar.entity';
import { ToolbarService } from './toolbar.service';
import { ToolbarController } from './toolbar.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ToolbarPreference]), PermissionsModule],
  controllers: [ToolbarController],
  providers: [ToolbarService],
  exports: [ToolbarService],
})
export class ToolbarModule {}
