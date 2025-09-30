import { Module } from '@nestjs/common';
import { UploadsController } from 'omniboxd/uploads/uploads.controller';
import { UploadsService } from 'omniboxd/uploads/uploads.service';

@Module({
  exports: [UploadsService],
  providers: [UploadsService],
  controllers: [UploadsController],
  imports: [],
})
export class UploadsModule {}
