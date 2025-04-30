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
} from '@nestjs/common';
import { SpaceType } from './resources.entity';

@Controller('api/v1/resources')
export class ResourcesController {
  constructor(private readonly resourcesService: ResourcesService) { }

  @Post()
  async create(@Req() req, @Body() data: CreateResourceDto) {
    return await this.resourcesService.create(req.user, data);
  }

  @Get('root')
  async getRoot(
    @Query('namespace') namespace: string,
    @Query('spaceType') spaceType: SpaceType,
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
    @Query('namespace') namespace: string,
    @Query('spaceType') spaceType: SpaceType,
    @Query('parentId') parentId: string,
    @Query('tags') tags: string,
    @Req() req,
  ) {
    return await this.resourcesService.query({
      namespaceId: namespace,
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
}
