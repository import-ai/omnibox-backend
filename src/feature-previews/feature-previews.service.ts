import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  FeaturePreviewFeature,
  FeaturePreviewListResponseDto,
  FeaturePreviewResponseDto,
} from 'omniboxd/feature-previews/dto/feature-preview.dto';
import { FeaturePreview } from 'omniboxd/feature-previews/entities/feature-preview.entity';
import { In, Repository } from 'typeorm';

@Injectable()
export class FeaturePreviewsService {
  private readonly features = Object.values(FeaturePreviewFeature);

  constructor(
    @InjectRepository(FeaturePreview)
    private readonly featurePreviewRepository: Repository<FeaturePreview>,
  ) {}

  async list(userId: string): Promise<FeaturePreviewListResponseDto> {
    const previews = await this.featurePreviewRepository.find({
      where: {
        userId,
        feature: In(this.features),
      },
    });
    const previewsByFeature = new Map(
      previews.map((preview) => [preview.feature, preview]),
    );

    const features = {} as Record<FeaturePreviewFeature, boolean>;
    for (const feature of this.features) {
      const preview = previewsByFeature.get(feature);
      features[feature] = preview?.enabled ?? false;
    }
    return { features };
  }

  async update(
    userId: string,
    feature: FeaturePreviewFeature,
    enabled: boolean,
  ): Promise<FeaturePreviewResponseDto> {
    await this.featurePreviewRepository
      .createQueryBuilder()
      .insert()
      .into(FeaturePreview)
      .values({ userId, feature, enabled })
      .onConflict(
        '("user_id", "feature") WHERE "deleted_at" IS NULL DO UPDATE SET "enabled" = EXCLUDED."enabled", "updated_at" = now()',
      )
      .execute();

    const preview = await this.featurePreviewRepository.findOneOrFail({
      where: { userId, feature },
    });
    return FeaturePreviewResponseDto.fromEntity(preview);
  }
}
