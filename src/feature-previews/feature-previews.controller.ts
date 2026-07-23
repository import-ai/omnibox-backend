import { Body, Controller, Get, Put } from '@nestjs/common';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import {
  FeaturePreviewListResponseDto,
  FeaturePreviewResponseDto,
  UpdateFeaturePreviewRequestDto,
} from 'omniboxd/feature-previews/dto/feature-preview.dto';
import { FeaturePreviewsService } from 'omniboxd/feature-previews/feature-previews.service';

@Controller('api/v1/feature-previews')
export class FeaturePreviewsController {
  constructor(
    private readonly featurePreviewsService: FeaturePreviewsService,
  ) {}

  @Get()
  async list(@UserId() userId: string): Promise<FeaturePreviewListResponseDto> {
    return await this.featurePreviewsService.list(userId);
  }

  @Put()
  async update(
    @UserId() userId: string,
    @Body() dto: UpdateFeaturePreviewRequestDto,
  ): Promise<FeaturePreviewResponseDto> {
    return await this.featurePreviewsService.update(
      userId,
      dto.feature,
      dto.enabled,
    );
  }
}
