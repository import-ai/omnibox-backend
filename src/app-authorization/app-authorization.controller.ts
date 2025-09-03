import { AppAuthorizationService } from './app-authorization.service';
import {
  AppAuthorizationResponseDto,
  CreateAppAuthorizationDto,
  UpdateAppAuthorizationDto,
} from './app-authorization.dto';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { UserId } from 'omniboxd/decorators/user-id.decorator';

@Controller('api/v1/namespaces/:namespaceId/apps/authorizations')
export class AppAuthorizationController {
  constructor(
    private readonly appAuthorizationService: AppAuthorizationService,
  ) {}

  @Post()
  async create(
    @Param('namespaceId') namespaceId: string,
    @UserId() userId: string,
    @Body() createDto: CreateAppAuthorizationDto,
  ): Promise<AppAuthorizationResponseDto> {
    return await this.appAuthorizationService.create(
      namespaceId,
      userId,
      createDto,
    );
  }

  @Get()
  async findAll(
    @Param('namespaceId') namespaceId: string,
    @UserId() userId: string,
    @Query('app_id') appId?: string,
    @Query('user_id') targetUserId?: string,
  ): Promise<AppAuthorizationResponseDto[]> {
    return await this.appAuthorizationService.findAll(
      namespaceId,
      userId,
      appId,
      targetUserId,
    );
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @UserId() userId: string,
  ): Promise<AppAuthorizationResponseDto> {
    return await this.appAuthorizationService.findOne(id, userId);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @UserId() userId: string,
    @Body() updateDto: UpdateAppAuthorizationDto,
  ): Promise<AppAuthorizationResponseDto> {
    return await this.appAuthorizationService.update(id, userId, updateDto);
  }

  @Delete(':id')
  async delete(
    @Param('id') id: string,
    @UserId() userId: string,
  ): Promise<void> {
    return await this.appAuthorizationService.delete(id, userId);
  }
}
