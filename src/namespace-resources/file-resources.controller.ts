import { Request, Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
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
import { UserId } from 'omniboxd/decorators/user-id.decorator';

@Controller('api/v1/namespaces/:namespaceId/resources/files')
export class FileResourcesController {
  constructor(
    private readonly namespaceResourcesService: NamespaceResourcesService,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UserId() userId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('file_name') fileName: string,
    @Body('namespace_id') namespaceId: string,
    @Body('parent_id') parentId: string,
  ) {
    const newResource = await this.namespaceResourcesService.uploadFile(
      userId,
      namespaceId,
      file,
      fileName,
      parentId,
      undefined,
    );
    return await this.namespaceResourcesService.getPath({
      namespaceId,
      userId,
      resourceId: newResource.id,
    });
  }

  @Post('chunk')
  @UseInterceptors(FileInterceptor('chunk'))
  async uploadFileChunk(
    @UploadedFile() chunk: Express.Multer.File,
    @Body('chunk_number') chunkNumber: string,
    @Body('file_hash') fileHash: string,
    @Body('namespace_id') namespaceId: string,
  ) {
    return this.namespaceResourcesService.uploadFileChunk(
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
    return this.namespaceResourcesService.cleanFileChunks(
      namespaceId,
      chunksNumber,
      fileHash,
    );
  }

  @Post('merge')
  async mergeFileChunks(
    @Req() req: Request,
    @Body('namespace_id') namespaceId: string,
    @Body('total_chunks', ParseIntPipe) totalChunks: number,
    @Body('file_hash') fileHash: string,
    @Body('file_name') fileName: string,
    @Body('mimetype') mimetype: string,
    @Body('parent_id') parentId: string,
  ) {
    const newResource = await this.namespaceResourcesService.mergeFileChunks(
      req.user!.id,
      namespaceId,
      totalChunks,
      fileHash,
      fileName,
      mimetype,
      parentId,
    );
    return await this.namespaceResourcesService.getPath({
      namespaceId,
      userId: req.user!.id,
      resourceId: newResource.id,
    });
  }

  @Patch(':resourceId')
  @UseInterceptors(FileInterceptor('file'))
  async patchFile(
    @UserId() userId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('file_name') fileName: string,
    @Body('namespace_id') namespaceId: string,
    @Body('resource_id') resourceId: string,
  ) {
    return this.namespaceResourcesService.uploadFile(
      userId,
      namespaceId,
      file,
      fileName,
      undefined,
      resourceId,
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
