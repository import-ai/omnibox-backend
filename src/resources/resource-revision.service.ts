import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { NamespaceTier } from 'omniboxd/namespaces/dto/namespace-tier.enum';
import { NamespacesQuotaService } from 'omniboxd/namespaces/namespaces-quota.service';
import {
  isContentResourceType,
  Resource,
} from 'omniboxd/resources/entities/resource.entity';
import { User } from 'omniboxd/user/entities/user.entity';
import { Between, EntityManager, Repository } from 'typeorm';

import { ResourceRevision } from './entities/resource-revision.entity';

export interface ResourceRevisionSummary {
  id: string;
  version: number;
  name: string;
  createdAt: Date;
  author: { id: string; username: string } | null;
  isCurrent: boolean;
}

export interface ResourceRevisionDetail extends ResourceRevisionSummary {
  resourceId: string;
  content: string;
  contentHash: string;
}

@Injectable()
export class ResourceRevisionService {
  constructor(
    @InjectRepository(ResourceRevision)
    private readonly revisionRepository: Repository<ResourceRevision>,
    private readonly namespacesQuotaService: NamespacesQuotaService,
  ) {}

  async historyLimit(
    namespaceId: string,
    resourceId?: string,
  ): Promise<number> {
    if (resourceId) {
      const resource = await this.revisionRepository.manager
        .getRepository(Resource)
        .findOne({
          where: { namespaceId, id: resourceId },
          select: { resourceType: true },
        });
      if (resource && !isContentResourceType(resource.resourceType)) return 0;
    }
    const tier =
      await this.namespacesQuotaService.getNamespaceTier(namespaceId);
    return tier === NamespaceTier.PREMIUM ? 100 : 3;
  }

  async archive(
    resource: Resource,
    limit: number,
    manager: EntityManager,
  ): Promise<void> {
    const repository = manager.getRepository(ResourceRevision);
    await repository.insert({
      namespaceId: resource.namespaceId,
      resourceId: resource.id,
      version: resource.version,
      name: resource.name,
      content: resource.content,
      authorId: resource.revisionAuthorId,
      createdAt: resource.revisionCreatedAt,
    });
    await repository
      .createQueryBuilder()
      .delete()
      .where('namespace_id = :namespaceId AND resource_id = :resourceId', {
        namespaceId: resource.namespaceId,
        resourceId: resource.id,
      })
      .andWhere('version <= :cutoff', { cutoff: resource.version - limit })
      .execute();
  }

  async list(resource: Resource): Promise<ResourceRevisionSummary[]> {
    const limit = await this.historyLimit(resource.namespaceId);
    return this.revisionRepository.manager.transaction(
      'REPEATABLE READ',
      async (manager) => {
        const current = await manager.getRepository(Resource).findOneByOrFail({
          namespaceId: resource.namespaceId,
          id: resource.id,
        });
        const revisions = await manager.getRepository(ResourceRevision).find({
          where: {
            namespaceId: current.namespaceId,
            resourceId: current.id,
            version: Between(current.version - limit, current.version - 1),
          },
          select: {
            id: true,
            version: true,
            name: true,
            createdAt: true,
            author: { id: true, username: true },
          },
          relations: { author: true },
          order: { version: 'DESC' },
          take: limit,
        });
        const author = current.revisionAuthorId
          ? await manager
              .getRepository(User)
              .findOneBy({ id: current.revisionAuthorId })
          : null;
        return [
          {
            id: 'current',
            version: current.version,
            name: current.name,
            createdAt: current.revisionCreatedAt,
            author: author
              ? { id: author.id, username: author.username }
              : null,
            isCurrent: true,
          },
          ...revisions.map((revision) => this.toSummary(revision)),
        ];
      },
    );
  }

  async get(
    resource: Resource,
    revisionId: string,
    manager?: EntityManager,
    limit?: number,
  ): Promise<ResourceRevisionDetail | null> {
    if (!manager) {
      const historyLimit = await this.historyLimit(resource.namespaceId);
      return this.revisionRepository.manager.transaction(
        'REPEATABLE READ',
        async (manager) => {
          const current = await manager
            .getRepository(Resource)
            .findOneByOrFail({
              namespaceId: resource.namespaceId,
              id: resource.id,
            });
          return this.get(current, revisionId, manager, historyLimit);
        },
      );
    }
    if (revisionId === 'current') {
      const author = resource.revisionAuthorId
        ? await manager
            .getRepository(User)
            .findOneBy({ id: resource.revisionAuthorId })
        : null;
      return {
        id: 'current',
        version: resource.version,
        resourceId: resource.id,
        name: resource.name,
        content: resource.content,
        contentHash: this.contentHash(resource.content),
        createdAt: resource.revisionCreatedAt,
        author: author ? { id: author.id, username: author.username } : null,
        isCurrent: true,
      };
    }
    if (!isUUID(revisionId)) return null;
    const revision = await manager.getRepository(ResourceRevision).findOne({
      where: {
        id: revisionId,
        namespaceId: resource.namespaceId,
        resourceId: resource.id,
      },
      relations: { author: true },
    });
    if (
      !revision ||
      revision.version < resource.version - limit! ||
      revision.version >= resource.version
    )
      return null;
    return {
      ...this.toSummary(revision),
      resourceId: revision.resourceId,
      content: revision.content,
      contentHash: this.contentHash(revision.content),
    };
  }

  private contentHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  private toSummary(revision: ResourceRevision): ResourceRevisionSummary {
    return {
      id: revision.id,
      version: revision.version,
      name: revision.name,
      createdAt: revision.createdAt,
      author: revision.author
        ? { id: revision.author.id, username: revision.author.username }
        : null,
      isCurrent: false,
    };
  }
}
