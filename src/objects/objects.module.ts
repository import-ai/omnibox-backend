import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ObjectsController } from 'omniboxd/objects/objects.controller';
import { ObjectsService } from 'omniboxd/objects/objects.service';

@Module({
  exports: [ObjectsService],
  providers: [ObjectsService],
  controllers: [ObjectsController],
  imports: [ConfigModule],
})
export class ObjectsModule {}
