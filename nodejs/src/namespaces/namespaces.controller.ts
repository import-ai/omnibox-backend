import { Controller, Get, Post, Delete, Body, Param, Query } from '@nestjs/common';
import { NamespacesService } from './namespaces.service';
import { Namespace } from './namespaces.entity';

@Controller('api/namespaces')
export class NamespacesController {
  constructor(private readonly namespacesService: NamespacesService) {}

  @Get()
  async getNamespaces(@Query('userId') userId: string): Promise<Namespace[]> {
    return this.namespacesService.getNamespaces(userId);
  }

  @Post()
  async createNamespace(@Body('name') name: string, @Body('ownerId') ownerId: string): Promise<Namespace> {
    return this.namespacesService.createNamespace(name, ownerId);
  }

  @Delete('/:namespaceId')
  async deleteNamespace(@Param('namespaceId') namespaceId: string, @Query('userId') userId: string): Promise<void> {
    return this.namespacesService.deleteNamespace(namespaceId, userId);
  }
}
