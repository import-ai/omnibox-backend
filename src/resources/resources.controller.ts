import { ResourcesService, IQuery } from 'src/resources/resources.service';
import { CreateResourceDto } from 'src/resources/dto/create-resource.dto';
import { UpdateResourceDto } from 'src/resources/dto/update-resource.dto';
import {
  Req,
  Get,
  Post,
  Body,
  Query,
  Param,
  Patch,
  Delete,
  Controller,
  ParseIntPipe,
} from '@nestjs/common';

@Controller('api/v1/resources')
export class ResourcesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  @Post()
  async create(@Req() req, @Body() data: CreateResourceDto) {
    return await this.resourcesService.create(req.user.id, data);
  }

  @Get('root')
  async getRoot(
    @Query('namespace', ParseIntPipe) namespace: number,
    @Query('spaceType') spaceType: string,
    @Req() req,
  ) {
    return await this.resourcesService.getRoot(
      namespace,
      spaceType,
      req.user.id,
    );
  }

  @Get('query')
  async query(
    @Query('namespace', ParseIntPipe) namespace: number,
    @Query('spaceType') spaceType: string,
    @Query('parentId', ParseIntPipe) parentId: number,
    @Query('tags') tags: string,
    @Req() req,
  ) {
    return await this.resourcesService.query({
      namespace,
      spaceType,
      parentId,
      tags,
      userId: req.user.id,
    });
  }

  @Get(':id')
  async get(@Param('id', ParseIntPipe) id: number) {
    return await this.resourcesService.get(id);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: UpdateResourceDto,
  ) {
    return await this.resourcesService.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id', ParseIntPipe) id: number) {
    return await this.resourcesService.delete(id);
  }
}
