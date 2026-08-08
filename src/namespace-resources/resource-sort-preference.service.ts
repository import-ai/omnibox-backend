import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { NamespaceMember } from 'omniboxd/namespaces/entities/namespace-member.entity';
import {
  getDefaultSortOptions,
  ResourceSortBy,
  ResourceSortOptions,
  ResourceSortSpaceType,
} from 'omniboxd/resources/resource-sort';
import { IsNull, Repository } from 'typeorm';

import {
  ResourceSortPreferenceResponseDto,
  ResourceSortPreferencesResponseDto,
  UpdateResourceSortPreferenceDto,
} from './dto/resource-sort-preference.dto';
import { ResourceSortPreference } from './entities/resource-sort-preference.entity';

@Injectable()
export class ResourceSortPreferenceService {
  constructor(
    @InjectRepository(ResourceSortPreference)
    private readonly preferenceRepository: Repository<ResourceSortPreference>,
    @InjectRepository(NamespaceMember)
    private readonly namespaceMemberRepository: Repository<NamespaceMember>,
    private readonly i18n: I18nService,
  ) {}

  private async ensureMember(
    namespaceId: string,
    userId: string,
  ): Promise<void> {
    const member = await this.namespaceMemberRepository.findOne({
      where: { namespaceId, userId, deletedAt: IsNull() },
    });
    if (!member) {
      throw new AppException(
        this.i18n.t('namespace.errors.notAMember'),
        'NOT_A_MEMBER',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  async getSortOptions(
    userId: string,
    namespaceId: string,
    spaceType: ResourceSortSpaceType,
  ): Promise<ResourceSortOptions> {
    const preference = await this.preferenceRepository.findOne({
      where: { userId, namespaceId, spaceType },
    });
    return preference
      ? { sortBy: preference.sortBy, sortOrder: preference.sortOrder }
      : getDefaultSortOptions();
  }

  async list(
    userId: string,
    namespaceId: string,
  ): Promise<ResourceSortPreferencesResponseDto> {
    await this.ensureMember(namespaceId, userId);
    const preferences = await this.preferenceRepository.find({
      where: { userId, namespaceId },
    });
    const preferencesBySpace = new Map(
      preferences.map((preference) => [preference.spaceType, preference]),
    );

    return Object.values(ResourceSortSpaceType).reduce((result, spaceType) => {
      const preference = preferencesBySpace.get(spaceType);
      const defaults = getDefaultSortOptions();
      result[spaceType] = ResourceSortPreferenceResponseDto.fromValues(
        spaceType,
        preference?.sortBy ?? defaults.sortBy ?? ResourceSortBy.UPDATED_AT,
        preference?.sortOrder ?? defaults.sortOrder!,
      );
      return result;
    }, {} as ResourceSortPreferencesResponseDto);
  }

  async update(
    userId: string,
    namespaceId: string,
    dto: UpdateResourceSortPreferenceDto,
  ): Promise<ResourceSortPreferenceResponseDto> {
    await this.ensureMember(namespaceId, userId);
    await this.preferenceRepository
      .createQueryBuilder()
      .insert()
      .into(ResourceSortPreference)
      .values({
        userId,
        namespaceId,
        spaceType: dto.spaceType,
        sortBy: dto.sortBy,
        sortOrder: dto.sortOrder,
      })
      .orUpdate(
        ['sort_by', 'sort_order'],
        ['user_id', 'namespace_id', 'space_type'],
        { indexPredicate: '"deleted_at" IS NULL' },
      )
      .execute();

    return ResourceSortPreferenceResponseDto.fromValues(
      dto.spaceType,
      dto.sortBy,
      dto.sortOrder,
    );
  }
}
