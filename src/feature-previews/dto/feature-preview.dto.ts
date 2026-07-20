import { IsBoolean, IsEnum } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { FeaturePreview } from 'omniboxd/feature-previews/entities/feature-preview.entity';

export enum FeaturePreviewFeature {
  EDITOR_V2 = 'editor_v2',
}

export interface FeaturePreviewListResponseDto {
  features: Record<FeaturePreviewFeature, boolean>;
}

export class UpdateFeaturePreviewRequestDto {
  @IsEnum(FeaturePreviewFeature, {
    message: i18nValidationMessage('validation.errors.isEnum'),
  })
  feature: FeaturePreviewFeature;

  @IsBoolean({
    message: i18nValidationMessage('validation.errors.enabled.isBoolean'),
  })
  enabled: boolean;
}

export class FeaturePreviewResponseDto {
  feature: FeaturePreviewFeature;

  enabled: boolean;

  static fromEntity(entity: FeaturePreview): FeaturePreviewResponseDto {
    const dto = new FeaturePreviewResponseDto();
    dto.feature = entity.feature as FeaturePreviewFeature;
    dto.enabled = entity.enabled;
    return dto;
  }
}
