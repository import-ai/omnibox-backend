import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  HttpStatus,
} from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18n, I18nContext } from 'nestjs-i18n';
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
  async list(@Req() req, @Param('namespaceId') namespaceId: string) {
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
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Body() createGroupDto: CreateGroupDto,
    @I18n() i18n: I18nContext,
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
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('groupId') groupId: string,
    @Body() updateGroupDto: UpdateGroupDto,
    @I18n() i18n: I18nContext,
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
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('groupId') groupId: string,
    @I18n() i18n: I18nContext,
  ) {
    await this.groupsService.deleteGroup(namespaceId, groupId);
  }

  @NamespaceOwner()
  @Get(':groupId/users')
  async listGroupUsers(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('groupId') groupId: string,
    @I18n() i18n: I18nContext,
  ) {
    const users = await this.groupsService.listGroupUsers(namespaceId, groupId);
    return plainToInstance(GroupUserDto, users, {
      excludeExtraneousValues: true,
    });
  }

  @NamespaceOwner()
  @Post(':groupId/users')
  async addGroupUser(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('groupId') groupId: string,
    @Body() addGroupUserDto: AddGroupUserDto,
    @I18n() i18n: I18nContext,
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
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('groupId') groupId: string,
    @Param('userId') userId: string,
    @I18n() i18n: I18nContext,
  ) {
    await this.groupsService.deleteGroupUser(namespaceId, groupId, userId);
  }
}
