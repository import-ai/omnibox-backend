import { Namespace } from 'src/namespaces/namespaces.entity';
import { NamespacesService } from 'src/namespaces/namespaces.service';
import {
  Get,
  Post,
  Body,
  Param,
  Query,
  Delete,
  Controller,
} from '@nestjs/common';

@Controller('api/v1/namespaces')
export class NamespacesController {
  constructor(private readonly namespacesService: NamespacesService) {}

  @Get()
  async getNamespaces(@Query('userId') userId: string): Promise<Namespace[]> {
    return await this.namespacesService.getByUser(userId);
  }

  @Post()
  async createNamespace(
    @Body('name') name: string,
    @Body('ownerId') ownerId: string,
  ): Promise<Namespace> {
    return await this.namespacesService.create(name, ownerId);
  }

  @Delete(':namespaceId')
  async deleteNamespace(
    @Param('namespaceId') namespaceId: string,
    @Query('userId') userId: string,
  ): Promise<void> {
    return await this.namespacesService.delete(namespaceId, userId);
  }
}
