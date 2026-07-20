import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import {
  FeaturePreviewResponseDto,
  UpdateFeaturePreviewRequestDto,
} from 'omniboxd/feature-previews/dto/feature-preview.dto';
import { FeaturePreviewsService } from 'omniboxd/feature-previews/feature-previews.service';

@Controller('api/v1/namespaces/:namespaceId/feature-previews')
export class FeaturePreviewsController {
  constructor(
    private readonly featurePreviewsService: FeaturePreviewsService,
  ) {}

  @Get()
  async list(
    @Param('namespaceId') namespaceId: string,
    @UserId() userId: string,
  ): Promise<FeaturePreviewResponseDto[]> {
    return await this.featurePreviewsService.list(namespaceId, userId);
  }

  @Put()
  async update(
    @Param('namespaceId') namespaceId: string,
    @UserId() userId: string,
    @Body() dto: UpdateFeaturePreviewRequestDto,
  ): Promise<FeaturePreviewResponseDto> {
    return await this.featurePreviewsService.update(
      namespaceId,
      userId,
      dto.feature,
      dto.enabled,
    );
  }
}
