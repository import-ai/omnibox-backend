import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { plainToInstance } from 'class-transformer';
import { GroupDto } from './dto/group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { MemberDto } from './dto/member.dto';
import { AddMemberDto } from './dto/add-member.dto';

@Controller('api/v1/namespaces/:namespaceId/groups')
export class GroupController {
  constructor(private readonly groupsService: GroupsService) {}

  @Get()
  async list(@Req() req, @Param('namespaceId') namespaceId: string) {
    const groups = await this.groupsService.listGroupByUser(
      namespaceId,
      req.user.id,
    );
    return plainToInstance(GroupDto, groups);
  }

  @Post()
  async create(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Body() createGroupDto: CreateGroupDto,
  ) {
    const group = await this.groupsService.createGroup(
      namespaceId,
      req.user.id,
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
    if (
      !(await this.groupsService.userInGroup(namespaceId, groupId, req.user.id))
    ) {
      throw new UnauthorizedException('user is not a member of this group');
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
    if (
      !(await this.groupsService.userInGroup(namespaceId, groupId, req.user.id))
    ) {
      throw new UnauthorizedException('user is not a member of this group');
    }
    await this.groupsService.deleteGroup(namespaceId, groupId);
  }

  @Get(':groupId/members')
  async listMembers(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('groupId') groupId: string,
  ) {
    if (
      !(await this.groupsService.userInGroup(namespaceId, groupId, req.user.id))
    ) {
      throw new UnauthorizedException('user is not a member of this group');
    }
    const members = await this.groupsService.listMembers(namespaceId, groupId);
    return plainToInstance(MemberDto, members);
  }

  @Post(':groupId/members')
  async addMember(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('groupId') groupId: string,
    @Body() addMemberDto: AddMemberDto,
  ) {
    if (
      !(await this.groupsService.userInGroup(namespaceId, groupId, req.user.id))
    ) {
      throw new UnauthorizedException('user is not a member of this group');
    }
    await this.groupsService.addMember(
      namespaceId,
      groupId,
      addMemberDto.userId,
    );
  }

  @Delete(':groupId/members/:userId')
  async deleteMember(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('groupId') groupId: string,
    @Param('userId') userId: string,
  ) {
    if (
      !(await this.groupsService.userInGroup(namespaceId, groupId, req.user.id))
    ) {
      throw new UnauthorizedException('user is not a member of this group');
    }
    await this.groupsService.deleteMember(namespaceId, groupId, userId);
  }
}
