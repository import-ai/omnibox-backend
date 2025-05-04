import { ResourcesService } from 'src/resources/resources.service';
import { CreateResourceDto } from 'src/resources/dto/create-resource.dto';
import { UpdateResourceDto } from 'src/resources/dto/update-resource.dto';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { SpaceType } from './resources.entity';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';

@Controller('api/v1/resources')
export class ResourcesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  @Post()
  async create(@Req() req, @Body() data: CreateResourceDto) {
    return await this.resourcesService.create(req.user, data);
  }

  @Get('root')
  async getRoot(
    @Query('namespace_id') namespaceId: string,
    @Query('space_type') spaceType: SpaceType,
    @Req() req,
  ) {
    return await this.resourcesService.getRoot(
      namespaceId,
      spaceType,
      req.user.id,
    );
  }

  @Get('query')
  async query(
    @Query('namespace') namespaceId: string,
    @Query('spaceType') spaceType: SpaceType,
    @Query('parentId') parentId: string,
    @Query('tags') tags: string,
  ) {
    return await this.resourcesService.query({
      namespaceId,
      spaceType,
      parentId,
      tags,
    });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return await this.resourcesService.get(id);
  }

  @Patch(':id')
  async update(
    @Req() req,
    @Param('id') id: string,
    @Body() data: UpdateResourceDto,
  ) {
    return await this.resourcesService.update(req.user, id, data);
  }

  @Delete(':id')
  async delete(@Req() req, @Param('id') id: string) {
    return await this.resourcesService.delete(req.user, id);
  }

  @Post('files')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @Req() req,
    @UploadedFile() file: Express.Multer.File,
    @Body('namespace_id') namespaceId: string,
    @Body('parent_id') parentId: string,
  ) {
    return this.resourcesService.uploadFile(
      req.user,
      namespaceId,
      file,
      parentId,
      undefined,
    );
  }

  @Patch('files/:id')
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

  @Get('files/:id')
  async downloadFile(@Param('id') resourceId: string, @Res() res: Response) {
    const { fileStream, resource } =
      await this.resourcesService.downloadFile(resourceId);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${resource.name}"`,
    );
    res.setHeader(
      'Content-Type',
      resource.attrs?.mimetype || 'application/octet-stream',
    );
    fileStream.pipe(res);
  }
}
