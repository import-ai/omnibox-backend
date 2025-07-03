import { TagService } from 'src/tag/tag.service';
import { CreateTagDto } from 'src/tag/dto/create-tag.dto';
import { Get, Body, Param, Query, Post, Controller } from '@nestjs/common';

@Controller('api/v1/namespaces/:namespaceId/tag')
export class TagController {
  constructor(private tagService: TagService) {}

  @Post()
  async create(
    @Param('namespaceId') namespaceId: string,
    @Body() createTagDto: CreateTagDto,
  ) {
    return await this.tagService.create(namespaceId, createTagDto);
  }

  @Get()
  async findAll(
    @Param('namespaceId') namespaceId: string,
    @Query('name') name: string,
  ) {
    return await this.tagService.findAll(namespaceId, name);
  }

  @Get('tags-by-ids')
  async tagsByIds(
    @Param('namespaceId') namespaceId: string,
    @Query('id') id: string,
  ) {
    if (!id) {
      return [];
    }
    const ids = id.split(',');
    if (ids.length <= 0) {
      return [];
    }
    return await this.tagService.tagsByIds(namespaceId, ids);
  }
}
