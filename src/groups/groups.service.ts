import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
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

  async listGroups(namespaceId: string): Promise<Group[]> {
    return await this.groupRepository.find({
      where: {
        namespace: { id: namespaceId },
      },
    });
  }

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
    createGroupDto: CreateGroupDto,
  ): Promise<Group> {
    return await this.groupRepository.save(
      this.groupRepository.create({
        namespace: { id: namespaceId },
        title: createGroupDto.title,
      }),
    );
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

  async addGroupUser(
    namespaceId: string,
    groupId: string,
    userId: string,
    manager?: EntityManager,
  ) {
    const queryBuilder = manager
      ? manager.createQueryBuilder()
      : this.dataSource.createQueryBuilder();
    await queryBuilder
      .insert()
      .into(GroupUser)
      .values({
        namespace: { id: namespaceId },
        group: { id: groupId },
        user: { id: userId },
      })
      .orIgnore()
      .execute();
  }

  async deleteGroupUser(namespaceId: string, groupId: string, userId: string) {
    await this.groupUserRepository.softDelete({
      namespace: { id: namespaceId },
      group: { id: groupId },
      user: { id: userId },
    });
  }
}
