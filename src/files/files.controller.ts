import { Controller, Param, Post } from '@nestjs/common';
import { FilesService } from './files.service';
import { UserId } from 'omniboxd/decorators/user-id.decorator';

@Controller('api/v1/namespaces/:namespaceId/files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post()
  async createFile(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
  ) {
    return await this.filesService.createFile(userId, namespaceId);
  }
}
