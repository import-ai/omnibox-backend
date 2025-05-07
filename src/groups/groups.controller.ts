import {
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { GroupsService } from './groups.service';

@Controller('api/v1/namespaces/:namespaceId/groups')
export class GroupController {
  constructor(private readonly groupsService: GroupsService) {}

  @Get()
  async list(@Req() req, @Param('namespaceId') namespaceId: string) {
    // todo
  }

  @Post()
  async create(@Req() req, @Param('namespaceId') namespaceId: string) {
    // todo
  }

  @Patch(':groupId')
  async update(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('groupId') groupId: string,
  ) {
    // todo
  }

  @Delete(':groupId')
  async delete(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('groupId') groupId: string,
  ) {
    // todo
  }
}
