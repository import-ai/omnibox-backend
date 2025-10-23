import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { plainToInstance } from 'class-transformer';
import { GroupDto } from './dto/group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { GroupUserDto } from './dto/group-user.dto';
import { AddGroupUserDto } from './dto/add-group-user.dto';
import { NamespaceOwner } from 'omniboxd/namespaces/decorators/namespace-owner.decorator';

@Controller('api/v1/namespaces/:namespaceId/groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @NamespaceOwner()
  @Get()
  async list(@Param('namespaceId') namespaceId: string) {
    const groups = await this.groupsService.listGroups(namespaceId);
    const invitations =
      await this.groupsService.listGroupInvitations(namespaceId);
    const invitationMap = new Map(
      invitations.map((invitation) => [invitation.groupId, invitation]),
    );
    return groups.map((group) => {
      const groupDto = plainToInstance(GroupDto, group, {
        excludeExtraneousValues: true,
      });
      const invitation = invitationMap.get(group.id);
      groupDto.invitationId = invitation?.id;
      return groupDto;
    });
  }

  @NamespaceOwner()
  @Post()
  async create(
    @Param('namespaceId') namespaceId: string,
    @Body() createGroupDto: CreateGroupDto,
  ) {
    const group = await this.groupsService.createGroup(
      namespaceId,
      createGroupDto,
    );
    return plainToInstance(GroupDto, group);
  }

  @NamespaceOwner()
  @Patch(':groupId')
  async update(
    @Param('namespaceId') namespaceId: string,
    @Param('groupId') groupId: string,
    @Body() updateGroupDto: UpdateGroupDto,
  ) {
    const group = await this.groupsService.updateGroup(
      namespaceId,
      groupId,
      updateGroupDto,
    );
    return plainToInstance(GroupDto, group);
  }

  @NamespaceOwner()
  @Delete(':groupId')
  async delete(
    @Param('namespaceId') namespaceId: string,
    @Param('groupId') groupId: string,
  ) {
    await this.groupsService.deleteGroup(namespaceId, groupId);
  }

  @NamespaceOwner()
  @Get(':groupId/users')
  async listGroupUsers(
    @Param('namespaceId') namespaceId: string,
    @Param('groupId') groupId: string,
  ) {
    const users = await this.groupsService.listGroupUsers(namespaceId, groupId);
    return plainToInstance(GroupUserDto, users, {
      excludeExtraneousValues: true,
    });
  }

  @NamespaceOwner()
  @Post(':groupId/users')
  async addGroupUser(
    @Param('namespaceId') namespaceId: string,
    @Param('groupId') groupId: string,
    @Body() addGroupUserDto: AddGroupUserDto,
  ) {
    const actions: Array<Promise<any>> = [];
    addGroupUserDto.userIds.forEach((userId) => {
      if (userId) {
        actions.push(
          this.groupsService.addGroupUser(namespaceId, groupId, userId),
        );
      }
    });
    await Promise.all(actions);
  }

  @NamespaceOwner()
  @Delete(':groupId/users/:userId')
  async deleteGroupUser(
    @Param('namespaceId') namespaceId: string,
    @Param('groupId') groupId: string,
    @Param('userId') userId: string,
  ) {
    await this.groupsService.deleteGroupUser(namespaceId, groupId, userId);
  }
}
