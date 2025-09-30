import { Controller, Post } from '@nestjs/common';
import { ObjectsService } from 'omniboxd/objects/objects.service';

@Controller('api/v1/objects')
export class ObjectsController {
  constructor(private readonly objectsService: ObjectsService) {}

  @Post('upload-session')
  async createUploadSession() {
    return await this.objectsService.createUploadSession();
  }
}
