import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Applications } from './applications.entity';
import { ApplicationsService } from './applications.service';
import { ApplicationsController } from './applications.controller';

@Module({
  providers: [ApplicationsService],
  controllers: [ApplicationsController],
  exports: [ApplicationsService],
  imports: [TypeOrmModule.forFeature([Applications])],
})
export class ApplicationsModule {}
