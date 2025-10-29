import { Body, Controller, Param, Post } from '@nestjs/common';
import { FilesService } from './files.service';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { CreateFileReqDto } from './dtos/create-file-req.dto';

@Controller('api/v1/namespaces/:namespaceId/files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post()
  async createFile(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Body() createReq: CreateFileReqDto,
  ) {
    return await this.filesService.createFile(userId, namespaceId, createReq);
  }
}
