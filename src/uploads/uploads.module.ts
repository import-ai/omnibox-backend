import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UploadsController } from 'omniboxd/uploads/uploads.controller';
import { UploadsService } from 'omniboxd/uploads/uploads.service';

@Module({
  exports: [UploadsService],
  providers: [UploadsService],
  controllers: [UploadsController],
  imports: [ConfigModule],
})
export class UploadsModule {}
