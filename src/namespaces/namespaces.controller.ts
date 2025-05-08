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
} from '@nestjs/common';

@Controller('api/v1/namespaces')
export class NamespacesController {
  constructor(private readonly namespacesService: NamespacesService) {}

  @Get()
  @Get('user')
  async getByUser(@Req() req) {
    return await this.namespacesService.listNamespaces(req.user.id);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return await this.namespacesService.get(id);
  }

  @Get(':id/members')
  async listMembers(@Req() req, @Param('id') namespaceId: string) {
    return await this.namespacesService.listMembers(namespaceId);
  }

  @Post()
  async create(@Req() req, @Body('name') name: string) {
    return await this.namespacesService.create(req.user.id, name);
  }

  @Post('disable-user')
  async disableUser(
    @Body('namespace') namespaceId: string,
    @Body('id') userId: string,
  ) {
    return await this.namespacesService.disableUser(namespaceId, userId);
  }

  @Post('remove-user')
  async removeUser(
    @Body('namespace') namespaceId: string,
    @Body('id') userId: string,
  ) {
    return await this.namespacesService.removeUser(namespaceId, userId);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body('name') name: string) {
    return await this.namespacesService.update(id, { name });
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return await this.namespacesService.delete(id);
  }
}
