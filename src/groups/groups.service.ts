import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  In,
  IsNull,
  Not,
  Repository,
} from 'typeorm';
import { Group } from './entities/group.entity';
import { GroupUser } from './entities/group-user.entity';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { User } from 'omniboxd/user/entities/user.entity';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import { Invitation } from 'omniboxd/invitations/entities/invitation.entity';
import { UserService } from 'omniboxd/user/user.service';

@Injectable()
export class GroupsService {
  constructor(
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    @InjectRepository(GroupUser)
    private readonly groupUserRepository: Repository<GroupUser>,
    @InjectRepository(Invitation)
    private readonly invitationsRepository: Repository<Invitation>,
    private readonly dataSource: DataSource,
    private readonly UserService: UserService,
    private readonly namespaceService: NamespacesService,
  ) {}

  async listGroupInvitations(namespaceId: string): Promise<Invitation[]> {
    return await this.invitationsRepository.find({
      where: {
        namespaceId,
        groupId: Not(IsNull()),
      },
    });
  }

  async listGroups(namespaceId: string): Promise<Group[]> {
    return await this.groupRepository.find({
      where: {
        namespaceId,
      },
    });
  }

  async get(id: string) {
    return await this.groupRepository.findOne({ where: { id } });
  }

  async listGroupByUser(namespaceId: string, userId: string): Promise<Group[]> {
    const groups = await this.groupUserRepository.find({
      where: {
        namespaceId,
        userId,
      },
    });
    return await Promise.all(groups.map((user) => this.get(user.groupId))).then(
      (groups) => groups.filter((group) => !!group),
    );
  }

  async createGroup(
    namespaceId: string,
    createGroupDto: CreateGroupDto,
  ): Promise<Group> {
    return await this.groupRepository.save(
      this.groupRepository.create({
        namespaceId,
        title: createGroupDto.title,
      }),
    );
  }

  async getGroupsByTitles(
    namespaceId: string,
    titles: string[],
  ): Promise<Group[]> {
    const groups = await this.groupRepository.findBy({
      namespaceId,
      title: In(titles),
    });
    return groups;
  }

  async userInGroup(
    namespaceId: string,
    groupId: string,
    userId: string,
  ): Promise<boolean> {
    const user = await this.groupUserRepository.findOne({
      where: {
        namespaceId,
        groupId,
        userId,
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
      where: { namespaceId, id: groupId },
    });
    group.title = updateGroupDto.title;
    return await this.groupRepository.save(group);
  }

  async deleteGroup(namespaceId: string, groupId: string) {
    await this.groupRepository.softDelete({
      namespaceId,
      id: groupId,
    });
  }

  async listGroupUsers(namespaceId: string, groupId: string): Promise<User[]> {
    const groupUsers = await this.groupUserRepository.find({
      where: {
        namespaceId,
        groupId,
      },
    });
    return await Promise.all(
      groupUsers.map((groupUser) =>
        this.namespaceService
          .getMemberByUserId(namespaceId, groupUser.userId)
          .then((member) =>
            this.UserService.find(groupUser.userId).then((user) => {
              return Promise.resolve({
                role: member ? member.role : 'member',
                ...user,
              });
            }),
          ),
      ),
    );
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
        namespaceId,
        groupId,
        userId,
      })
      .orIgnore()
      .execute();
  }

  async deleteGroupUser(namespaceId: string, groupId: string, userId: string) {
    await this.groupUserRepository.softDelete({
      namespaceId,
      groupId,
      userId,
    });
  }
}
