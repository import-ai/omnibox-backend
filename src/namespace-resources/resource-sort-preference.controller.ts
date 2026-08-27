import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { UserId } from 'omniboxd/decorators/user-id.decorator';

import {
  ResourceSortPreferenceResponseDto,
  ResourceSortPreferencesResponseDto,
  UpdateResourceSortPreferenceDto,
} from './dto/resource-sort-preference.dto';
import { ResourceSortPreferenceService } from './resource-sort-preference.service';

@Controller('api/v1/namespaces/:namespaceId/resource-sort-preferences')
export class ResourceSortPreferenceController {
  constructor(
    private readonly resourceSortPreferenceService: ResourceSortPreferenceService,
  ) {}

  @Get()
  async list(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
  ): Promise<ResourceSortPreferencesResponseDto> {
    return await this.resourceSortPreferenceService.list(userId, namespaceId);
  }

  @Put()
  async update(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Body() dto: UpdateResourceSortPreferenceDto,
  ): Promise<ResourceSortPreferenceResponseDto> {
    return await this.resourceSortPreferenceService.update(
      userId,
      namespaceId,
      dto,
    );
  }
}
