import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Group } from './entities/group.entity';
import { GroupMember } from './entities/group-member.entity';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';

@Injectable()
export class GroupsService {
  constructor(
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    @InjectRepository(GroupMember)
    private readonly groupMemberRepository: Repository<GroupMember>,
    private readonly dataSource: DataSource,
  ) {}

  async listGroupByUser(namespaceId: string, userId: string): Promise<Group[]> {
    const groups = await this.groupMemberRepository.find({
      where: {
        namespaceId: namespaceId,
        userId: userId,
      },
      relations: ['group'],
    });
    return groups.map((member) => member.group);
  }

  async createGroup(
    namespaceId: string,
    userId: string,
    createGroupDto: CreateGroupDto,
  ): Promise<Group> {
    return await this.dataSource.transaction(async (manager) => {
      const group = await manager.save(
        manager.create(Group, {
          namespaceId,
          title: createGroupDto.title,
        }),
      );
      await manager.save(
        manager.create(GroupMember, {
          namespaceId,
          groupId: group.id,
          userId,
        }),
      );
      return group;
    });
  }

  async userInGroup(
    namespaceId: string,
    groupId: string,
    userId: string,
  ): Promise<boolean> {
    const member = await this.groupMemberRepository.findOne({
      where: {
        namespaceId,
        groupId,
        userId,
      },
    });
    return member !== null;
  }

  async updateGroup(
    namespaceId: string,
    groupId: string,
    updateGroupDto: UpdateGroupDto,
  ): Promise<Group> {
    const group = await this.groupRepository.findOneOrFail({
      where: { namespaceId, id: groupId },
    });
    group.title = updateGroupDto.title;
    return await this.groupRepository.save(group);
  }

  async deleteGroup(namespaceId: string, groupId: string) {
    await this.groupRepository.softDelete({ namespaceId, id: groupId });
  }
}
