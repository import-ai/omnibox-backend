import { ApplicationsService } from './applications.service';
import {
  ApplicationsResponseDto,
  CreateApplicationsDto,
  FindAllApplicationsDto,
} from './applications.dto';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { UserId } from 'omniboxd/decorators/user-id.decorator';

@Controller('api/v1/namespaces/:namespaceId/applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Get()
  async findAll(
    @Param('namespaceId') namespaceId: string,
    @UserId() userId: string,
    @Query() query: FindAllApplicationsDto,
  ): Promise<ApplicationsResponseDto[]> {
    const options = {
      apiKeyId: query.api_key_id,
    };
    return await this.applicationsService.findAll(namespaceId, userId, options);
  }

  @Get(':appId')
  async findOne(
    @Param('appId') appId: string,
    @Param('namespaceId') namespaceId: string,
    @UserId() userId: string,
  ): Promise<ApplicationsResponseDto> {
    return await this.applicationsService.findOne(appId, namespaceId, userId);
  }

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
