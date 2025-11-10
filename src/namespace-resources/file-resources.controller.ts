import { Response } from 'express';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { CreateFileReqDto } from './dto/create-file-req.dto';

@Controller('api/v1/namespaces/:namespaceId/resources/files')
export class FileResourcesController {
  constructor(
    private readonly namespaceResourcesService: NamespaceResourcesService,
  ) {}

  @Post()
  async createResourceFile(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Body() createReq: CreateFileReqDto,
  ) {
    return await this.namespaceResourcesService.createResourceFile(
      userId,
      namespaceId,
      createReq,
    );
  }

  @Get(':resourceId')
  async downloadFile(
    @Param('resourceId') resourceId: string,
    @Res() res: Response,
  ) {
    return await this.namespaceResourcesService.fileResponse(resourceId, res);
  }
}
