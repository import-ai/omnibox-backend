import { NamespaceRole } from './entities/namespace-member.entity';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import {
  Req,
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

@Controller('api/v1/namespaces')
export class NamespacesController {
  constructor(private readonly namespacesService: NamespacesService) {}

  @Get()
  async listNamespaces(@Req() req) {
    return await this.namespacesService.listNamespaces(req.user.id);
  }

  @Get(':namespaceId')
  async get(@Param('namespaceId') namespaceId: string) {
    return await this.namespacesService.getNamespace(namespaceId);
  }

  @NamespaceAdmin()
  @Get(':namespaceId/members')
  async listMembers(@Param('namespaceId') namespaceId: string) {
    return await this.namespacesService.listMembers(namespaceId);
  }

  @Get(':namespaceId/members/count')
  async countMembers(@Param('namespaceId') namespaceId: string) {
    const count = await this.namespacesService.countMembers(namespaceId);
    return { count };
  }

  @NamespaceAdmin()
  @Get(':namespaceId/members/:userId')
  async getMemberByUserId(
    @Param('namespaceId') namespaceId: string,
    @Param('userId') userId: string,
  ) {
    return await this.namespacesService.getMemberByUserId(namespaceId, userId);
  }

  @NamespaceAdmin()
  @Patch(':namespaceId/members/:userId')
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

  @Delete(':namespaceId/members/:userId')
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

  @Get(':namespaceId/root')
  async getRoot(
    @Param('namespaceId') namespaceId: string,
    @UserId() userId: string,
  ) {
    return await this.namespacesService.getRoot(namespaceId, userId);
  }

  @Get(':namespaceId/private')
  async getPrivateRoot(
    @Param('namespaceId') namespaceId: string,
    @UserId() userId: string,
  ) {
    return await this.namespacesService.getPrivateRoot(userId, namespaceId);
  }

  @Post()
  async create(@Req() req, @Body() createDto: CreateNamespaceDto) {
    return await this.namespacesService.createNamespaceForUser(
      req.user.id,
      createDto.name,
    );
  }

  @NamespaceAdmin()
  @Patch(':namespaceId')
  async update(
    @Param('namespaceId') namespaceId: string,
    @Body() updateDto: UpdateNamespaceDto,
  ) {
    return await this.namespacesService.update(namespaceId, updateDto);
  }

  @NamespaceOwner()
  @Post(':namespaceId/transfer-ownership')
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
  @Delete(':namespaceId')
  async delete(@Param('namespaceId') namespaceId: string) {
    return await this.namespacesService.delete(namespaceId);
  }
}
