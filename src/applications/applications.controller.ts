import { ApplicationsService } from './applications.service';
import {
  ApplicationsResponseDto,
  CreateApplicationsDto,
} from './applications.dto';
import { Body, Controller, Delete, Param, Post } from '@nestjs/common';
import { UserId } from 'omniboxd/decorators/user-id.decorator';

@Controller('api/v1/namespaces/:namespaceId/applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post(':appId')
  async create(
    @Param('appId') appId: string,
    @Param('namespaceId') namespaceId: string,
    @UserId() userId: string,
    @Body() createDto: CreateApplicationsDto,
  ): Promise<ApplicationsResponseDto> {
    return await this.applicationsService.create(
      appId,
      namespaceId,
      userId,
      createDto,
    );
  }

  @Delete(':id')
  async delete(
    @Param('id') id: string,
    @Param('namespaceId') namespaceId: string,
    @UserId() userId: string,
  ): Promise<void> {
    return await this.applicationsService.delete(id, namespaceId, userId);
  }
}
