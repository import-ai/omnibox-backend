import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { NamespaceMember } from 'omniboxd/namespaces/entities/namespace-member.entity';
import { User } from 'omniboxd/user/entities/user.entity';
import { EntityManager, In, Repository } from 'typeorm';

import { ResourceContributorDto } from './dto/resource-contributor.dto';
import { NamespaceMemberNameSnapshot } from './entities/namespace-member-name-snapshot.entity';
import { Resource, ResourceType } from './entities/resource.entity';
import { ResourceCollaborator } from './entities/resource-collaborator.entity';
import {
  contributorInitial,
  contributorLabel,
  contributorTone,
  formerContributorLabel,
  historicalMemberDisplayName,
} from './resource-contributors';

export interface RecordResourceEdit {
  namespaceId: string;
  resourceId: string;
  resourceType: ResourceType;
  creatorUserId: string | null;
  actorUserId: string;
  parentId: string | null;
  explicitNameChanged: boolean;
  contentChanged: boolean;
  tagsChanged: boolean;
}

@Injectable()
export class ResourceContributorsService {
  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(ResourceCollaborator)
    private readonly collaboratorRepository: Repository<ResourceCollaborator>,
    @InjectRepository(NamespaceMemberNameSnapshot)
    private readonly snapshotRepository: Repository<NamespaceMemberNameSnapshot>,
    @InjectRepository(NamespaceMember)
    private readonly memberRepository: Repository<NamespaceMember>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async recordEdit(
    manager: EntityManager,
    edit: RecordResourceEdit,
  ): Promise<void> {
    if (
      edit.resourceType !== ResourceType.DOC ||
      !(edit.explicitNameChanged || edit.contentChanged || edit.tagsChanged) ||
      !edit.actorUserId ||
      edit.actorUserId === edit.creatorUserId
    ) {
      return;
    }
    const memberCount = await manager.count(NamespaceMember, {
      where: { namespaceId: edit.namespaceId, userId: edit.actorUserId },
    });
    if (memberCount === 0 || !(await this.isTeamResource(manager, edit))) {
      return;
    }
    await manager
      .createQueryBuilder()
      .insert()
      .into(ResourceCollaborator)
      .values({
        namespaceId: edit.namespaceId,
        resourceId: edit.resourceId,
        userId: edit.actorUserId,
        firstCollaboratedAt: new Date(),
      })
      .orIgnore()
      .execute();
  }

  async present(
    namespaceId: string,
    resourceId: string,
    interactive: boolean,
  ): Promise<{
    creator: ResourceContributorDto | null;
    collaborators: ResourceContributorDto[];
  }> {
    const empty = { creator: null, collaborators: [] };
    const resource = await this.resourceRepository.findOne({
      where: { namespaceId, id: resourceId },
      select: ['id', 'namespaceId', 'parentId', 'resourceType', 'userId'],
    });
    if (
      !resource ||
      resource.resourceType !== ResourceType.DOC ||
      !(await this.isTeamResource(this.resourceRepository.manager, {
        namespaceId,
        parentId: resource.parentId,
      }))
    ) {
      return empty;
    }

    const collaboratorRows = await this.collaboratorRepository.find({
      where: { namespaceId, resourceId },
      order: { firstCollaboratedAt: 'ASC', id: 'ASC' },
    });
    const userIds = new Set<string>();
    if (resource.userId) {
      userIds.add(resource.userId);
    }
    for (const row of collaboratorRows) {
      if (row.userId !== resource.userId) {
        userIds.add(row.userId);
      }
    }
    if (userIds.size === 0) {
      return empty;
    }
    const ids = [...userIds];
    const [users, members, snapshots] = await Promise.all([
      this.userRepository.find({
        where: { id: In(ids) },
        withDeleted: true,
      }),
      this.memberRepository.find({
        where: { namespaceId, userId: In(ids) },
        withDeleted: true,
      }),
      this.snapshotRepository.find({
        where: { namespaceId, userId: In(ids) },
      }),
    ]);
    const usersById = new Map(users.map((user) => [user.id, user]));
    const membershipsByUser = new Map<string, typeof members>();
    for (const member of members) {
      const rows = membershipsByUser.get(member.userId) ?? [];
      rows.push(member);
      membershipsByUser.set(member.userId, rows);
    }
    const snapshotsById = new Map(
      snapshots.map((snapshot) => [snapshot.userId, snapshot]),
    );
    const toDto = (userId: string): ResourceContributorDto | null => {
      const memberships = membershipsByUser.get(userId) ?? [];
      const member = memberships.find((row) => !row.deletedAt);
      const user = usersById.get(userId);
      const snapshot = snapshotsById.get(userId);
      const label = member
        ? contributorLabel({
            nickname: member.nickname,
            username: user?.username,
            email: user?.email,
            userId,
          })
        : formerContributorLabel({
            historicalName: historicalMemberDisplayName(memberships),
            frozenLabel: snapshot?.label,
            username: user?.username,
            email: user?.email,
            userId,
          });
      if (!label) {
        return null;
      }
      const canHover = Boolean(member) && interactive;
      const dto: ResourceContributorDto = {
        label,
        initial: contributorInitial(label),
        tone: contributorTone(userId),
        interactive: canHover,
      };
      // Public shares and former members stay non-interactive and carry no id.
      if (canHover) {
        dto.user_id = userId;
      }
      return dto;
    };

    return {
      creator: resource.userId ? toDto(resource.userId) : null,
      collaborators: collaboratorRows
        .filter((row) => row.userId !== resource.userId)
        .map((row) => toDto(row.userId))
        .filter((person): person is ResourceContributorDto => person !== null),
    };
  }

  async freezeMember(
    namespaceId: string,
    userId: string,
    manager: EntityManager,
  ): Promise<void> {
    const user = await manager.findOne(User, {
      where: { id: userId },
      withDeleted: true,
    });
    const member = await manager.findOne(NamespaceMember, {
      where: { namespaceId, userId },
    });
    const label = contributorLabel({
      nickname: member?.nickname,
      username: user?.username,
      email: user?.email,
      userId,
    });
    if (!label) {
      return;
    }
    const repo = manager.getRepository(NamespaceMemberNameSnapshot);
    const existing = await repo.findOne({ where: { namespaceId, userId } });
    if (existing) {
      existing.label = label;
      await repo.save(existing);
      return;
    }
    await repo.save(repo.create({ namespaceId, userId, label }));
  }

  async freezeUser(userId: string, manager: EntityManager): Promise<void> {
    const memberships = await manager.find(NamespaceMember, {
      where: { userId },
    });
    for (const membership of memberships) {
      await this.freezeMember(membership.namespaceId, userId, manager);
    }
  }

  async clearSnapshot(
    namespaceId: string,
    userId: string,
    manager: EntityManager,
  ): Promise<void> {
    await manager
      .getRepository(NamespaceMemberNameSnapshot)
      .softDelete({ namespaceId, userId });
  }

  private async isTeamResource(
    manager: EntityManager,
    resource: { namespaceId: string; parentId: string | null },
  ): Promise<boolean> {
    if (!resource.parentId) {
      return false;
    }
    const rows: unknown[] = await manager.query(
      `WITH RECURSIVE ancestors AS (
         SELECT id, parent_id, 1 AS depth
         FROM resources
         WHERE namespace_id = $1 AND id = $2 AND deleted_at IS NULL
         UNION ALL
         SELECT r.id, r.parent_id, ancestors.depth + 1
         FROM resources r
         INNER JOIN ancestors ON r.id = ancestors.parent_id
         WHERE r.namespace_id = $1
           AND r.deleted_at IS NULL
           AND ancestors.depth < 100
       )
       SELECT 1 AS ok
       FROM ancestors
       INNER JOIN namespaces
         ON namespaces.id = $1
        AND namespaces.deleted_at IS NULL
        AND namespaces.root_resource_id = ancestors.id
       LIMIT 1`,
      [resource.namespaceId, resource.parentId],
    );
    return rows.length > 0;
  }
}
