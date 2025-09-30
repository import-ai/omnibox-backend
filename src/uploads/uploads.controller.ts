import { Controller, Get } from '@nestjs/common';
import { UploadsService } from 'omniboxd/uploads/uploads.service';

@Controller('api/v1/uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Get()
  async getUploadInfo() {
    return await this.uploadsService.getUploadInfo();
  }
}
