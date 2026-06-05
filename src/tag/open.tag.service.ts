import { Injectable } from '@nestjs/common';
import { CreateTagRequestDto } from 'omniboxd/tag/dto/create-tag-request.dto';
import { OpenListTagsRequestDto } from 'omniboxd/tag/dto/open-list-tags-request.dto';
import { TagDto } from 'omniboxd/tag/dto/tag.dto';
import { TagService } from 'omniboxd/tag/tag.service';

@Injectable()
export class OpenTagService {
  constructor(private readonly tagService: TagService) {}

  async create(
    namespaceId: string,
    createTagRequestDto: CreateTagRequestDto,
  ): Promise<TagDto> {
    const tag = await this.tagService.create(namespaceId, createTagRequestDto);
    return TagDto.fromEntity(tag);
  }

  async findAll(
    namespaceId: string,
    query: OpenListTagsRequestDto,
  ): Promise<TagDto[]> {
    const ids = query.ids ?? query.id;
    if (ids && ids.length > 0) {
      const tags = await this.tagService.findByIds(namespaceId, ids);
      return tags.map((tag) => TagDto.fromEntity(tag));
    }

    const tags = await this.tagService.findAll(namespaceId, query.name, {
      offset: query.offset,
      limit: query.limit,
    });
    return tags.map((tag) => TagDto.fromEntity(tag));
  }
}
