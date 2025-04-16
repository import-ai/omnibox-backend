import { Resource } from 'src/resources/resources.entity';
import { ResourcesService } from 'src/resources/resources.service';
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
} from '@nestjs/common';

@Controller('api/v1/resources')
export class ResourcesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  @Post()
  async createResource(@Body() data: Partial<Resource>) {
    return await this.resourcesService.create(data);
  }

  @Get('root')
  async getRootResource(
    @Query('namespace') namespaceId: string,
    @Query('spaceType') spaceType: string,
    @Req() req,
  ) {
    return await this.resourcesService.getRoot(
      namespaceId,
      spaceType,
      req.user.user_id,
    );
  }

  @Get()
  async getResources(@Query() query: any) {
    return await this.resourcesService.get(query);
  }

  @Patch(':resourceId')
  async updateResource(
    @Param('resourceId') resourceId: string,
    @Body() data: Partial<Resource>,
  ) {
    return await this.resourcesService.update(resourceId, data);
  }

  @Delete(':resourceId')
  async deleteResource(@Param('resourceId') resourceId: string) {
    return await this.resourcesService.delete(resourceId);
  }
}
