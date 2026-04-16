import { HttpStatus, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TagService } from 'omniboxd/tag/tag.service';
import { TagDto } from 'omniboxd/tag/dto/tag.dto';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { VfsService } from 'omniboxd/vfs/vfs.service';
import { transaction } from 'omniboxd/utils/transaction-utils';
import { AppException } from 'omniboxd/common/exceptions/app.exception';

@Injectable()
export class VfsTagsService {
  constructor(
    private readonly tagService: TagService,
    private readonly vfsService: VfsService,
    private readonly resourcesService: ResourcesService,
    private readonly dataSource: DataSource,
  ) {}

  async addTagToResource(
    namespaceId: string,
    userId: string,
    mdPath: string,
    tagName: string,
  ): Promise<TagDto[]> {
    return await transaction(this.dataSource.manager, async (tx) => {
      const { resource } = await this.vfsService.getResourceDtoByPath(
        namespaceId,
        userId,
        mdPath,
      );
      if (!resource.parent_id) {
        throw new AppException(
          'can not add tag to root resource',
          'INVALID_PATH',
          HttpStatus.BAD_REQUEST,
        );
      }
      if (resource.tags.map((tag) => tag.name).includes(tagName)) {
        throw new AppException(
          `${mdPath} already has tag ${tagName}`,
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
    mdPath: string,
    tagName: string,
  ): Promise<TagDto[]> {
    return await transaction(this.dataSource.manager, async (tx) => {
      const { resource } = await this.vfsService.getResourceDtoByPath(
        namespaceId,
        userId,
        mdPath,
      );
      if (!resource.parent_id) {
        throw new AppException(
          'can not remove tag from root resource',
          'INVALID_PATH',
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
        `${tagName} not found in ${mdPath}`,
        'RESOURCE_TAG_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    });
  }
}
