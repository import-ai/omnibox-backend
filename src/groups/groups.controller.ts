import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { plainToInstance } from 'class-transformer';
import { GroupDto } from './dto/group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { GroupUserDto } from './dto/group-user.dto';
import { AddGroupUserDto } from './dto/add-group-user.dto';
import { NamespacesService } from 'src/namespaces/namespaces.service';

@Controller('api/v1/namespaces/:namespaceId/groups')
export class GroupsController {
  constructor(
    private readonly groupsService: GroupsService,
    private readonly namespacesService: NamespacesService,
  ) {}

  @Get()
  async list(@Req() req, @Param('namespaceId') namespaceId: string) {
    if (!(await this.namespacesService.userIsOwner(namespaceId, req.user.id))) {
      throw new ForbiddenException(
        'current user is not owner of this namespace',
      );
    }
    const groups = await this.groupsService.listGroups(namespaceId);
    return plainToInstance(GroupDto, groups);
  }

  @Post()
  async create(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Body() createGroupDto: CreateGroupDto,
  ) {
    if (!(await this.namespacesService.userIsOwner(namespaceId, req.user.id))) {
      throw new ForbiddenException(
        'current user is not owner of this namespace',
      );
    }
    const group = await this.groupsService.createGroup(
      namespaceId,
      createGroupDto,
    );
    return plainToInstance(GroupDto, group);
  }

  @Patch(':groupId')
  async update(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('groupId') groupId: string,
    @Body() updateGroupDto: UpdateGroupDto,
  ) {
    if (!(await this.namespacesService.userIsOwner(namespaceId, req.user.id))) {
      throw new ForbiddenException(
        'current user is not owner of this namespace',
      );
    }
    const group = await this.groupsService.updateGroup(
      namespaceId,
      groupId,
      updateGroupDto,
    );
    return plainToInstance(GroupDto, group);
  }

  @Delete(':groupId')
  async delete(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('groupId') groupId: string,
  ) {
    if (!(await this.namespacesService.userIsOwner(namespaceId, req.user.id))) {
      throw new ForbiddenException(
        'current user is not owner of this namespace',
      );
    }
    await this.groupsService.deleteGroup(namespaceId, groupId);
  }

  @Get(':groupId/users')
  async listGroupUsers(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('groupId') groupId: string,
  ) {
    if (!(await this.namespacesService.userIsOwner(namespaceId, req.user.id))) {
      throw new ForbiddenException(
        'current user is not owner of this namespace',
      );
    }
    const users = await this.groupsService.listGroupUsers(namespaceId, groupId);
    return plainToInstance(GroupUserDto, users);
  }

  @Post(':groupId/users')
  async addGroupUser(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('groupId') groupId: string,
    @Body() addGroupUserDto: AddGroupUserDto,
  ) {
    if (!(await this.namespacesService.userIsOwner(namespaceId, req.user.id))) {
      throw new ForbiddenException(
        'current user is not owner of this namespace',
      );
    }
    await this.groupsService.addGroupUser(
      namespaceId,
      groupId,
      addGroupUserDto.userId,
    );
  }

  @Delete(':groupId/users/:userId')
  async deleteGroupUser(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('groupId') groupId: string,
    @Param('userId') userId: string,
  ) {
    if (!(await this.namespacesService.userIsOwner(namespaceId, req.user.id))) {
      throw new ForbiddenException(
        'current user is not owner of this namespace',
      );
    }
    await this.groupsService.deleteGroupUser(namespaceId, groupId, userId);
  }
}
