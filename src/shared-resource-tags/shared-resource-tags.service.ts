import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { FilterTagsRequestDto } from 'omniboxd/resource-tags/dto/filter-tags-request.dto';
import { ListTagsRequestDto } from 'omniboxd/resource-tags/dto/list-tags-request.dto';
import { ListTagsResponseDto } from 'omniboxd/resource-tags/dto/list-tags-response.dto';
import { TagWithCountDto } from 'omniboxd/resource-tags/dto/tag-with-count.dto';
import { SharedResourcesService } from 'omniboxd/shared-resources/shared-resources.service';
import { Share } from 'omniboxd/shares/entities/share.entity';
import { TagService } from 'omniboxd/tag/tag.service';
import { isOptional } from 'omniboxd/utils/is-empty';

@Injectable()
export class SharedResourceTagsService {
  constructor(
    private readonly tagService: TagService,
    private readonly sharedResourcesService: SharedResourcesService,
  ) {}

  private async listTagIdsWithCount(
    share: Share,
  ): Promise<Map<string, number>> {
    const visibleResources =
      await this.sharedResourcesService.getAllSharedResources(share);
    const resources = await Promise.all(
      visibleResources.map((resource) =>
        this.sharedResourcesService.getAndValidateResource(share, resource.id),
      ),
    );

    const tagCounts = new Map<string, number>();
    resources.forEach((resource) => {
      if (resource.tagIds) {
        resource.tagIds.forEach((tagId) => {
          tagCounts.set(tagId, (tagCounts.get(tagId) || 0) + 1);
        });
      }
    });
    return tagCounts;
  }

  async listTagsWithCount(
    share: Share,
    options: ListTagsRequestDto,
  ): Promise<ListTagsResponseDto> {
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 20;

    const tagCounts = await this.listTagIdsWithCount(share);

    const tags = await this.tagService.findByIds(
      share.namespaceId,
      Array.from(tagCounts.keys()),
    );

    const tagDtoList: TagWithCountDto[] = [];
    for (const tag of tags) {
      const resourceCnt = tagCounts.get(tag.id);
      if (!resourceCnt) {
        throw new AppException(
          'tagId not found in tagCounts',
          'UNKNOWN_ERROR',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      tagDtoList.push(TagWithCountDto.fromEntityWithCount(tag, resourceCnt));
    }

    const sortedTagsDto: TagWithCountDto[] = tagDtoList.toSorted(
      (x, y) => y.resourceCnt - x.resourceCnt,
    );

    const total = sortedTagsDto.length;
    const paginatedTags = sortedTagsDto.slice(offset, offset + limit);

    return ListTagsResponseDto.fromTags(paginatedTags, total);
  }

  async filterTags(
    share: Share,
    options: FilterTagsRequestDto,
  ): Promise<ListTagsResponseDto> {
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 20;

    const fields = [
      'tagPattern',
      'resourceCntLessOrEqualThan',
      'resourceCntGreaterOrEqualThan',
    ];
    if (
      !options ||
      !Object.entries(options).some(
        ([k, v]) => fields.includes(k) && !isOptional(v),
      )
    ) {
      throw new AppException(
        'At least one filter parameter is required',
        'FILTER_REQUIRED',
        HttpStatus.BAD_REQUEST,
      );
    }

    const tagCounts = await this.listTagIdsWithCount(share);

    const tags = options.tagPattern
      ? await this.tagService.findByPattern(
          share.namespaceId,
          options.tagPattern,
        )
      : await this.tagService.findByIds(
          share.namespaceId,
          Array.from(tagCounts.keys()),
        );

    let tagsDto: TagWithCountDto[] = tags
      .filter((tag) => tagCounts.has(tag.id))
      .map((tag) => {
        const resourceCnt = tagCounts.get(tag.id);
        if (!resourceCnt) {
          throw new AppException(
            'tagId not found in tagCounts',
            'UNKNOWN_ERROR',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
        return TagWithCountDto.fromEntityWithCount(tag, resourceCnt);
      });

    const resourceCntGreaterOrEqualThan = options.resourceCntGreaterOrEqualThan;
    if (resourceCntGreaterOrEqualThan) {
      tagsDto = tagsDto.filter(
        (tag) => tag.resourceCnt >= resourceCntGreaterOrEqualThan,
      );
    }

    const resourceCntLessOrEqualThan = options.resourceCntLessOrEqualThan;
    if (resourceCntLessOrEqualThan) {
      tagsDto = tagsDto.filter(
        (tag) => tag.resourceCnt <= resourceCntLessOrEqualThan,
      );
    }

    return ListTagsResponseDto.fromTags(
      tagsDto
        .toSorted((x, y) => y.resourceCnt - x.resourceCnt)
        .slice(offset, offset + limit),
      tagsDto.length,
    );
  }
}
