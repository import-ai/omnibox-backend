import { HttpStatus, Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { FilterTagsRequestDto } from 'omniboxd/resource-tags/dto/filter-tags-request.dto';
import { ListTagsRequestDto } from 'omniboxd/resource-tags/dto/list-tags-request.dto';
import { ListTagsResponseDto } from 'omniboxd/resource-tags/dto/list-tags-response.dto';
import { TagRenameResponseDto } from 'omniboxd/resource-tags/dto/tag-rename.response.dto';
import { TagWithCountDto } from 'omniboxd/resource-tags/dto/tag-with-count.dto';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { TagDto } from 'omniboxd/tag/dto/tag.dto';
import { Tag } from 'omniboxd/tag/tag.entity';
import { TagService } from 'omniboxd/tag/tag.service';
import { isOptional } from 'omniboxd/utils/is-empty';
import { transaction } from 'omniboxd/utils/transaction-utils';
import { DataSource } from 'typeorm';

@Injectable()
export class ResourceTagsService {
  constructor(
    private readonly tagService: TagService,
    private readonly resourcesService: ResourcesService,
    private readonly namespaceResourcesService: NamespaceResourcesService,
    private readonly dataSource: DataSource,
    private readonly i18n: I18nService,
  ) {}

  async listTagIdsWithCount(
    namespaceId: string,
    userId: string,
  ): Promise<Map<string, number>> {
    const visibleResources =
      await this.namespaceResourcesService.getAllResourcesByUser(
        userId,
        namespaceId,
      );

    const tagCounts = new Map<string, number>();
    visibleResources.forEach((resource) => {
      if (resource.tagIds) {
        resource.tagIds.forEach((tagId) => {
          tagCounts.set(tagId, (tagCounts.get(tagId) || 0) + 1);
        });
      }
    });
    return tagCounts;
  }

  async listTagsWithCount(
    namespaceId: string,
    userId: string,
    options: ListTagsRequestDto,
  ): Promise<ListTagsResponseDto> {
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 20;

    const tagCounts = await this.listTagIdsWithCount(namespaceId, userId);

    const tags = await this.tagService.findByIds(
      namespaceId,
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
    namespaceId: string,
    userId: string,
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

    const tagCounts = await this.listTagIdsWithCount(namespaceId, userId);

    let tags: Tag[];

    if (options.tagPattern) {
      tags = await this.tagService.findByPattern(
        namespaceId,
        options.tagPattern,
      );
    } else {
      tags = await this.tagService.findByIds(
        namespaceId,
        Array.from(tagCounts.keys()),
      );
    }
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

  async renameTag(
    namespaceId: string,
    userId: string,
    oldName: string,
    newName: string,
  ): Promise<TagRenameResponseDto> {
    const oldTag = await this.tagService.findByName(namespaceId, oldName);
    if (!oldTag) {
      throw new AppException(
        `${oldName} not found`,
        'TAG_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }

    if (oldName === newName) {
      return TagRenameResponseDto.fromNumber(0);
    }

    const editableResources =
      await this.namespaceResourcesService.getAllResourcesByUser(
        userId,
        namespaceId,
        false,
        ResourcePermission.CAN_EDIT,
      );

    const resourcesWithOldTag = editableResources.filter((resource) =>
      resource.tagIds.includes(oldTag.id),
    );

    if (resourcesWithOldTag.length === 0) {
      return TagRenameResponseDto.fromNumber(0);
    }

    return await transaction(this.dataSource.manager, async (tx) => {
      const newTag = await this.tagService.getOrCreateTagByName(
        namespaceId,
        newName,
        tx.entityManager,
      );

      for (const resource of resourcesWithOldTag) {
        const newTagIds = resource.tagIds
          .filter((id) => id !== oldTag.id)
          .concat(newTag.id);

        await this.resourcesService.updateResource(
          namespaceId,
          resource.id,
          userId,
          {
            tagIds: newTagIds,
          },
          tx,
        );
      }
      return TagRenameResponseDto.fromNumber(resourcesWithOldTag.length);
    });
  }

  async addTagToResource(
    namespaceId: string,
    userId: string,
    resourceId: string,
    tagName: string,
  ): Promise<TagDto[]> {
    return await transaction(this.dataSource.manager, async (tx) => {
      const resource = await this.namespaceResourcesService.getResource({
        userId,
        namespaceId,
        resourceId,
      });
      if (!resource.parent_id) {
        throw new AppException(
          'can not add tag to root resource',
          'INVALID_RESOURCE',
          HttpStatus.BAD_REQUEST,
        );
      }
      if (resource.tags.map((tag) => tag.name).includes(tagName)) {
        throw new AppException(
          `${resourceId} already has tag ${tagName}`,
          'RESOURCE_TAG_DUPLICATE',
          HttpStatus.CONFLICT,
        );
      }
      const tag = await this.tagService.getOrCreateTagByName(
        namespaceId,
        tagName,
        tx.entityManager,
      );
      const newTags = resource.tags.concat(TagDto.fromEntity(tag));
      await this.resourcesService.updateResource(
        namespaceId,
        resource.id,
        userId,
        {
          tagIds: newTags.map((tag) => tag.id),
        },
        tx,
      );
      return newTags;
    });
  }

  async removeTagFromResource(
    namespaceId: string,
    userId: string,
    resourceId: string,
    tagName: string,
  ): Promise<TagDto[]> {
    return await transaction(this.dataSource.manager, async (tx) => {
      const resource = await this.namespaceResourcesService.getResource({
        userId,
        namespaceId,
        resourceId,
      });
      if (!resource.parent_id) {
        throw new AppException(
          'can not remove tag from root resource',
          'INVALID_RESOURCE',
          HttpStatus.BAD_REQUEST,
        );
      }
      if (resource.tags.map((tag) => tag.name).includes(tagName)) {
        const newTags = resource.tags.filter((tag) => tag.name !== tagName);
        await this.resourcesService.updateResource(
          namespaceId,
          resource.id,
          userId,
          {
            tagIds: newTags.map((tag) => tag.id),
          },
          tx,
        );
        return newTags;
      }
      throw new AppException(
        `${tagName} not found in ${resourceId}`,
        'RESOURCE_TAG_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    });
  }
}
