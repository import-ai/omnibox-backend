import { NamespacesService } from 'src/namespaces/namespaces.service';
import {
  Req,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  Controller,
  Query,
} from '@nestjs/common';
import { SpaceType } from './entities/namespace.entity';

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

  @Get(':namespaceId/root')
  async getRoot(
    @Param('namespaceId') namespaceId: string,
    @Query('space_type') spaceType: SpaceType,
    @Req() req,
  ) {
    return await this.namespacesService.getRoot(
      namespaceId,
      spaceType,
      req.user.id,
    );
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
