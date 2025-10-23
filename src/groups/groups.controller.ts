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
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';

@Controller('api/v1/namespaces/:namespaceId/groups')
export class GroupsController {
  constructor(
    private readonly groupsService: GroupsService,
    private readonly namespacesService: NamespacesService,
  ) {}

  @Get()
  async list(@Req() req, @Param('namespaceId') namespaceId: string, @I18n() i18n: I18nContext) {
    if (!(await this.namespacesService.userIsOwner(namespaceId, req.user.id))) {
      const message = i18n.t('namespace.errors.userNotOwner');
      throw new AppException(message, 'USER_NOT_OWNER', HttpStatus.FORBIDDEN);
    }

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

  @Post()
  async create(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Body() createGroupDto: CreateGroupDto,
    @I18n() i18n: I18nContext,
  ) {
    if (!(await this.namespacesService.userIsOwner(namespaceId, req.user.id))) {
      const message = i18n.t('namespace.errors.userNotOwner');
      throw new AppException(message, 'USER_NOT_OWNER', HttpStatus.FORBIDDEN);
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
    @I18n() i18n: I18nContext,
  ) {
    if (!(await this.namespacesService.userIsOwner(namespaceId, req.user.id))) {
      const message = i18n.t('namespace.errors.userNotOwner');
      throw new AppException(message, 'USER_NOT_OWNER', HttpStatus.FORBIDDEN);
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
    @I18n() i18n: I18nContext,
  ) {
    if (!(await this.namespacesService.userIsOwner(namespaceId, req.user.id))) {
      const message = i18n.t('namespace.errors.userNotOwner');
      throw new AppException(message, 'USER_NOT_OWNER', HttpStatus.FORBIDDEN);
    }
    await this.groupsService.deleteGroup(namespaceId, groupId);
  }

  @Get(':groupId/users')
  async listGroupUsers(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('groupId') groupId: string,
    @I18n() i18n: I18nContext,
  ) {
    if (!(await this.namespacesService.userIsOwner(namespaceId, req.user.id))) {
      const message = i18n.t('namespace.errors.userNotOwner');
      throw new AppException(message, 'USER_NOT_OWNER', HttpStatus.FORBIDDEN);
    }
    const users = await this.groupsService.listGroupUsers(namespaceId, groupId);
    return plainToInstance(GroupUserDto, users, {
      excludeExtraneousValues: true,
    });
  }

  @Post(':groupId/users')
  async addGroupUser(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('groupId') groupId: string,
    @Body() addGroupUserDto: AddGroupUserDto,
    @I18n() i18n: I18nContext,
  ) {
    if (!(await this.namespacesService.userIsOwner(namespaceId, req.user.id))) {
      const message = i18n.t('namespace.errors.userNotOwner');
      throw new AppException(message, 'USER_NOT_OWNER', HttpStatus.FORBIDDEN);
    }
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

  @Delete(':groupId/users/:userId')
  async deleteGroupUser(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('groupId') groupId: string,
    @Param('userId') userId: string,
    @I18n() i18n: I18nContext,
  ) {
    if (!(await this.namespacesService.userIsOwner(namespaceId, req.user.id))) {
      const message = i18n.t('namespace.errors.userNotOwner');
      throw new AppException(message, 'USER_NOT_OWNER', HttpStatus.FORBIDDEN);
    }
    await this.groupsService.deleteGroupUser(namespaceId, groupId, userId);
  }
}
