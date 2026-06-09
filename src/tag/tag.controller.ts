import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CreateTagRequestDto } from 'omniboxd/tag/dto/create-tag-request.dto';
import { TagService } from 'omniboxd/tag/tag.service';

@Controller('api/v1/namespaces/:namespaceId/tag')
export class TagController {
  constructor(private tagService: TagService) {}

  @Post()
  async create(
    @Param('namespaceId') namespaceId: string,
    @Body() createTagRequestDto: CreateTagRequestDto,
  ) {
    return await this.tagService.create(namespaceId, createTagRequestDto);
  }

  @Get()
  async findAll(
    @Param('namespaceId') namespaceId: string,
    @Query('name') name: string,
    @Query('id') id: string,
  ) {
    if (id) {
      const ids = id.split(',');
      if (ids.length <= 0) {
        return [];
      }
      return await this.tagService.findByIds(namespaceId, ids);
    }
    return await this.tagService.findAll(namespaceId, name);
  }
}
