import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Group } from './entities/group.entity';
import { GroupUser } from './entities/group-user.entity';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { User } from 'src/user/user.entity';

@Injectable()
export class GroupsService {
  constructor(
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    @InjectRepository(GroupUser)
    private readonly groupUserRepository: Repository<GroupUser>,
    private readonly dataSource: DataSource,
  ) {}

  async listGroupByUser(namespaceId: string, userId: string): Promise<Group[]> {
    const groups = await this.groupUserRepository.find({
      where: {
        namespace: { id: namespaceId },
        user: { id: userId },
      },
      relations: ['group'],
    });
    return groups.map((user) => user.group);
  }

  async createGroup(
    namespaceId: string,
    userId: string,
    createGroupDto: CreateGroupDto,
  ): Promise<Group> {
    return await this.dataSource.transaction(async (manager) => {
      const group = await manager.save(
        manager.create(Group, {
          namespace: { id: namespaceId },
          title: createGroupDto.title,
        }),
      );
      await manager.save(
        manager.create(GroupUser, {
          namespace: { id: namespaceId },
          group: { id: group.id },
          user: { id: userId },
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
    const user = await this.groupUserRepository.findOne({
      where: {
        namespace: { id: namespaceId },
        group: { id: groupId },
        user: { id: userId },
      },
    });
    return user !== null;
  }

  async updateGroup(
    namespaceId: string,
    groupId: string,
    updateGroupDto: UpdateGroupDto,
  ): Promise<Group> {
    const group = await this.groupRepository.findOneOrFail({
      where: { namespace: { id: namespaceId }, id: groupId },
    });
    group.title = updateGroupDto.title;
    return await this.groupRepository.save(group);
  }

  async deleteGroup(namespaceId: string, groupId: string) {
    await this.groupRepository.softDelete({
      namespace: { id: namespaceId },
      id: groupId,
    });
  }

  async listGroupUsers(namespaceId: string, groupId: string): Promise<User[]> {
    const users = await this.groupUserRepository.find({
      where: {
        namespace: { id: namespaceId },
        group: { id: groupId },
      },
      relations: ['user'],
    });
    return users.map((user) => user.user);
  }

  async addGroupUser(namespaceId: string, groupId: string, userId: string) {
    await this.groupUserRepository.save(
      this.groupUserRepository.create({
        namespace: { id: namespaceId },
        group: { id: groupId },
        user: { id: userId },
      }),
    );
  }

  async deleteGroupUser(namespaceId: string, groupId: string, userId: string) {
    await this.groupUserRepository.softDelete({
      namespace: { id: namespaceId },
      group: { id: groupId },
      user: { id: userId },
    });
  }
}
