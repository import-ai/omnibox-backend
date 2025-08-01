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

@Controller('api/v1/namespaces')
export class NamespacesController {
  constructor(private readonly namespacesService: NamespacesService) {}

  @Get()
  async listNamespaces(@Req() req) {
    return await this.namespacesService.listNamespaces(req.user.id);
  }

  @Get(':namespaceId')
  async get(@Param('namespaceId') namespaceId: string) {
    return await this.namespacesService.get(namespaceId);
  }

  @Get(':namespaceId/members')
  async listMembers(@Req() req, @Param('namespaceId') namespaceId: string) {
    return await this.namespacesService.listMembers(namespaceId);
  }

  @Get(':namespaceId/members/:userId')
  async getMemberByUserId(
    @Param('namespaceId') namespaceId: string,
    @Param('userId') userId: string,
  ) {
    return await this.namespacesService.getMemberByUserId(namespaceId, userId);
  }

  @Patch(':namespaceId/members/:userId')
  async UpdateMemberRole(
    @Param('namespaceId') namespaceId: string,
    @Param('userId') userId: string,
    @Body('role') role: NamespaceRole,
  ) {
    return await this.namespacesService.updateMemberRole(
      namespaceId,
      userId,
      role,
    );
  }

  @Delete(':namespaceId/members/:userId')
  async deleteMember(
    @Param('namespaceId') namespaceId: string,
    @Param('userId') userId: string,
  ) {
    return await this.namespacesService.deleteMember(namespaceId, userId);
  }

  @Get(':namespaceId/root')
  async getRoot(@Param('namespaceId') namespaceId: string, @Req() req) {
    return await this.namespacesService.getRoot(namespaceId, req.user.id);
  }

  @Post()
  async create(@Req() req, @Body('name') name: string) {
    return await this.namespacesService.createAndJoinNamespace(
      req.user.id,
      name,
    );
  }

  @Patch(':namespaceId')
  async update(
    @Param('namespaceId') namespaceId: string,
    @Body('name') name: string,
  ) {
    return await this.namespacesService.update(namespaceId, { name });
  }

  @Delete(':namespaceId')
  async delete(@Param('namespaceId') namespaceId: string) {
    return await this.namespacesService.delete(namespaceId);
  }
}
