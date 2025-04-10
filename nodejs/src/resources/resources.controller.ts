import { Controller, Post, Get, Patch, Delete, Body, Query, Param } from '@nestjs/common';
import { ResourcesService } from './resources.service';
import { Resource } from './resources.entity';
import { User } from 'src/user/user.entity';

@Controller('api/resources')
export class ResourcesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  @Post()
  async createResource(@Body() data: Partial<Resource>, @Body('user') user: User) {
    return this.resourcesService.createResource(data, user);
  }

  @Get('/root')
  async getRootResource(@Query('namespaceId') namespaceId: string, @Query('spaceType') spaceType: string, @Query('userId') userId: string) {
    return this.resourcesService.getRootResource(namespaceId, spaceType, userId);
  }

  @Get()
  async getResources(@Query() query: any) {
    return this.resourcesService.getResources(query);
  }

  @Patch('/:resourceId')
  async updateResource(@Param('resourceId') resourceId: string, @Body() data: Partial<Resource>) {
    return this.resourcesService.updateResource(resourceId, data);
  }

  @Delete('/:resourceId')
  async deleteResource(@Param('resourceId') resourceId: string) {
    return this.resourcesService.deleteResource(resourceId);
  }
}
