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
  ParseIntPipe,
} from '@nestjs/common';

@Controller('api/v1/namespaces')
export class NamespacesController {
  constructor(private readonly namespacesService: NamespacesService) {}

  @Get('user')
  async getByUser(@Req() req) {
    return await this.namespacesService.getByUser(req.user.id);
  }

  @Get(':id')
  async get(@Param('id', ParseIntPipe) id: number) {
    return await this.namespacesService.get(id);
  }

  @Post()
  async create(@Req() req, @Body('name') name: string) {
    return await this.namespacesService.create(req.user.id, name);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body('name') name: string,
  ) {
    return await this.namespacesService.update(id, name);
  }

  @Delete(':id')
  async delete(@Param('id', ParseIntPipe) id: number) {
    return await this.namespacesService.delete(id);
  }
}
