import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import {
  FeaturePreviewFeature,
  FeaturePreviewResponseDto,
} from 'omniboxd/feature-previews/dto/feature-preview.dto';
import { FeaturePreview } from 'omniboxd/feature-previews/entities/feature-preview.entity';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { In, Repository } from 'typeorm';

@Injectable()
export class FeaturePreviewsService {
  private readonly features = Object.values(FeaturePreviewFeature);

  constructor(
    @InjectRepository(FeaturePreview)
    private readonly featurePreviewRepository: Repository<FeaturePreview>,
    private readonly permissionsService: PermissionsService,
    private readonly i18n: I18nService,
  ) {}

  async list(
    namespaceId: string,
    userId: string,
  ): Promise<FeaturePreviewResponseDto[]> {
    await this.assertUserInNamespace(userId, namespaceId);

    const previews = await this.featurePreviewRepository.find({
      where: {
        namespaceId,
        userId,
        feature: In(this.features),
      },
    });
    const previewsByFeature = new Map(
      previews.map((preview) => [preview.feature, preview]),
    );

    return this.features.map((feature) => {
      const preview = previewsByFeature.get(feature);
      return preview
        ? FeaturePreviewResponseDto.fromEntity(preview)
        : FeaturePreviewResponseDto.disabled(feature);
    });
  }

  async update(
    namespaceId: string,
    userId: string,
    feature: FeaturePreviewFeature,
    enabled: boolean,
  ): Promise<FeaturePreviewResponseDto> {
    await this.assertUserInNamespace(userId, namespaceId);

    await this.featurePreviewRepository
      .createQueryBuilder()
      .insert()
      .into(FeaturePreview)
      .values({ namespaceId, userId, feature, enabled })
      .onConflict(
        '("namespace_id", "user_id", "feature") WHERE "deleted_at" IS NULL DO UPDATE SET "enabled" = EXCLUDED."enabled", "updated_at" = now()',
      )
      .execute();

    const preview = await this.featurePreviewRepository.findOneOrFail({
      where: { namespaceId, userId, feature },
    });
    return FeaturePreviewResponseDto.fromEntity(preview);
  }

  private async assertUserInNamespace(
    userId: string,
    namespaceId: string,
  ): Promise<void> {
    const hasAccess = await this.permissionsService.userInNamespace(
      userId,
      namespaceId,
    );
    if (!hasAccess) {
      const message = this.i18n.t('auth.errors.notAuthorized');
      throw new AppException(message, 'NOT_AUTHORIZED', HttpStatus.FORBIDDEN);
    }
  }
}
