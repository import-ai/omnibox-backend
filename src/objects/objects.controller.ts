import { Controller, Get } from '@nestjs/common';
import { ObjectsService } from 'omniboxd/objects/objects.service';

@Controller('api/v1/objects')
export class ObjectsController {
  constructor(private readonly objectsService: ObjectsService) {}

  @Get('upload-info')
  async getUploadInfo() {
    return await this.objectsService.getUploadInfo();
  }
}
