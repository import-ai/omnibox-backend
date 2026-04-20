import { NamespaceRole } from './entities/namespace-member.entity';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import {
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  Controller,
} from '@nestjs/common';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { CreateNamespaceDto } from './dto/create-namespace.dto';
import { UpdateNamespaceDto } from './dto/update-namespace.dto';
import { NamespaceOwner } from './decorators/namespace-owner.decorator';
import { NamespaceAdmin } from './decorators/namespace-admin.decorator';
import { MeNamespaceResponseDto } from 'omniboxd/namespaces/dto/me.namespace.response.dto';

@Controller('api/v1/namespaces')
export class NamespacesController {
  constructor(private readonly namespacesService: NamespacesService) {}

  @Get()
  async listNamespaces(@UserId() userId: string) {
    return await this.namespacesService.listNamespaces(userId);
  }

  @Post()
  async create(
    @UserId() userId: string,
    @Body() createDto: CreateNamespaceDto,
  ) {
    return await this.namespacesService.createAndJoinNamespace(
      userId,
      createDto.name,
    );
  }
}

@Controller('api/v1/namespaces/:namespaceId')
export class NamespacesSingleController {
  constructor(private readonly namespacesService: NamespacesService) {}

  @Get('me')
  async me(
    @Param('namespaceId') namespaceId: string,
    @UserId() userId: string,
  ): Promise<MeNamespaceResponseDto> {
    return await this.namespacesService.getMe(namespaceId, userId);
  }

  @Get()
  async get(@Param('namespaceId') namespaceId: string) {
    return await this.namespacesService.getNamespace(namespaceId);
  }

  @NamespaceAdmin()
  @Get('members')
  async listMembers(@Param('namespaceId') namespaceId: string) {
    return await this.namespacesService.listMembers(namespaceId);
  }

  @Get('members/count')
  async countMembers(@Param('namespaceId') namespaceId: string) {
    const count = await this.namespacesService.countMembers(namespaceId);
    return { count };
  }

  @NamespaceAdmin()
  @Get('members/:userId')
  async getMemberByUserId(
    @Param('namespaceId') namespaceId: string,
    @Param('userId') userId: string,
  ) {
    return await this.namespacesService.getMemberByUserId(namespaceId, userId);
  }

  @NamespaceAdmin()
  @Patch('members/:userId')
  async UpdateMemberRole(
    @Param('namespaceId') namespaceId: string,
    @Param('userId') userId: string,
    @Body('role') role: NamespaceRole,
    @UserId() currentUserId: string,
  ) {
    return await this.namespacesService.updateMemberRole(
      namespaceId,
      userId,
      role,
      currentUserId,
    );
  }

  @Delete('members/:userId')
  async deleteMember(
    @Param('namespaceId') namespaceId: string,
    @Param('userId') userId: string,
    @UserId() currentUserId: string,
  ) {
    return await this.namespacesService.deleteMember(
      namespaceId,
      userId,
      currentUserId,
    );
  }

  @Get('root')
  async getRoot(
    @Param('namespaceId') namespaceId: string,
    @UserId() userId: string,
  ) {
    return await this.namespacesService.getRoot(namespaceId, userId);
  }

  @Get('private')
  async getPrivateRoot(
    @Param('namespaceId') namespaceId: string,
    @UserId() userId: string,
  ) {
    return await this.namespacesService.getPrivateRoot(userId, namespaceId);
  }

  @NamespaceAdmin()
  @Patch()
  async update(
    @Param('namespaceId') namespaceId: string,
    @Body() updateDto: UpdateNamespaceDto,
  ) {
    return await this.namespacesService.update(namespaceId, updateDto);
  }

  @NamespaceOwner()
  @Post('transfer-ownership')
  async transferOwnership(
    @Param('namespaceId') namespaceId: string,
    @Body('newOwnerId') newOwnerId: string,
    @UserId() currentUserId: string,
  ) {
    return await this.namespacesService.transferOwnership(
      namespaceId,
      currentUserId,
      newOwnerId,
    );
  }

  @NamespaceOwner()
  @Delete()
  async delete(@Param('namespaceId') namespaceId: string) {
    return await this.namespacesService.delete(namespaceId);
  }
}
