import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';

@Controller('api/v1/namespaces/:namespaceId/resources/files')
export class FileResourcesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @Req() req,
    @UploadedFile() file: Express.Multer.File,
    @Body('namespace_id') namespaceId: string,
    @Body('parent_id') parentId: string,
  ) {
    const newResource = await this.resourcesService.uploadFile(
      req.user,
      namespaceId,
      file,
      parentId,
      undefined,
    );
    const { resource, permission, path } = await this.resourcesService.getPath({
      namespaceId,
      userId: req.user.id,
      resourceId: newResource.id,
    });
    return { ...resource, currentLevel: permission, path };
  }

  @Post('chunk')
  @UseInterceptors(FileInterceptor('chunk'))
  async uploadFileChunk(
    @UploadedFile() chunk: Express.Multer.File,
    @Body('chunk_number') chunkNumber: string,
    @Body('file_hash') fileHash: string,
    @Body('namespace_id') namespaceId: string,
  ) {
    return this.resourcesService.uploadFileChunk(
      namespaceId,
      chunk,
      chunkNumber,
      fileHash,
    );
  }

  @Post('chunk/clean')
  async cleanFileChunks(
    @Body('namespace_id') namespaceId: string,
    @Body('chunks_number') chunksNumber: string,
    @Body('file_hash') fileHash: string,
  ) {
    return this.resourcesService.cleanFileChunks(
      namespaceId,
      chunksNumber,
      fileHash,
    );
  }

  @Post('merge')
  async mergeFileChunks(
    @Req() req,
    @Body('namespace_id') namespaceId: string,
    @Body('total_chunks', ParseIntPipe) totalChunks: number,
    @Body('file_hash') fileHash: string,
    @Body('file_name') fileName: string,
    @Body('mimetype') mimetype: string,
    @Body('parent_id') parentId: string,
  ) {
    const newResource = await this.resourcesService.mergeFileChunks(
      req.user,
      namespaceId,
      totalChunks,
      fileHash,
      fileName,
      mimetype,
      parentId,
    );
    const { resource, permission, path } = await this.resourcesService.getPath({
      namespaceId,
      userId: req.user.id,
      resourceId: newResource.id,
    });
    return { ...resource, currentLevel: permission, path };
  }

  @Patch(':resourceId')
  @UseInterceptors(FileInterceptor('file'))
  async patchFile(
    @Req() req,
    @UploadedFile() file: Express.Multer.File,
    @Body('namespace_id') namespaceId: string,
    @Body('resource_id') resourceId: string,
  ) {
    return this.resourcesService.uploadFile(
      req.user,
      namespaceId,
      file,
      undefined,
      resourceId,
    );
  }

  @Get(':resourceId')
  async downloadFile(
    @Param('resourceId') resourceId: string,
    @Res() res: Response,
  ) {
    return await this.resourcesService.fileResponse(resourceId, res);
  }
}
