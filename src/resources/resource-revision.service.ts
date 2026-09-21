import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { NamespaceTier } from 'omniboxd/namespaces/dto/namespace-tier.enum';
import { NamespacesQuotaService } from 'omniboxd/namespaces/namespaces-quota.service';
import { Resource } from 'omniboxd/resources/entities/resource.entity';
import { User } from 'omniboxd/user/entities/user.entity';
import { EntityManager, Repository } from 'typeorm';

import { ResourceRevision } from './entities/resource-revision.entity';

export interface ResourceRevisionAuthor {
  id: string;
  username: string;
}

export interface ResourceRevisionSummary {
  id: string;
  name: string;
  createdAt: Date;
  author: ResourceRevisionAuthor | null;
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
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly namespacesQuotaService: NamespacesQuotaService,
  ) {}

  async createFromResource(
    resource: Resource,
    authorId: string | null,
    manager: EntityManager,
    createdAt: Date = resource.updatedAt,
  ): Promise<void> {
    const repository = manager.getRepository(ResourceRevision);
    const historyLimit = await this.historyLimit(resource.namespaceId);
    const latest = await repository.findOne({
      where: { namespaceId: resource.namespaceId, resourceId: resource.id },
      select: { id: true, createdAt: true },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    // Resource writes hold the resource row lock, so timestamps stay ordered
    // even when multiple revisions are saved within one millisecond.
    if (latest && createdAt.getTime() <= latest.createdAt.getTime()) {
      createdAt = new Date(latest.createdAt.getTime() + 1);
    }
    await repository.insert({
      namespaceId: resource.namespaceId,
      resourceId: resource.id,
      authorId,
      name: resource.name,
      content: resource.content ?? '',
      contentHash: this.contentHash(resource.content ?? ''),
      createdAt,
      updatedAt: createdAt,
    });
    await repository.query(
      `DELETE FROM resource_revisions WHERE id IN (
        SELECT id FROM resource_revisions
        WHERE namespace_id = $1 AND resource_id = $2
        ORDER BY created_at DESC, id DESC OFFSET $3
      )`,
      [resource.namespaceId, resource.id, historyLimit + 1],
    );
  }

  async hasRevisions(
    resource: Resource,
    manager?: EntityManager,
  ): Promise<boolean> {
    const repository = manager
      ? manager.getRepository(ResourceRevision)
      : this.revisionRepository;
    const count = await repository.count({
      where: {
        namespaceId: resource.namespaceId,
        resourceId: resource.id,
      },
    });
    return count > 0;
  }

  private async historyLimit(namespaceId: string): Promise<number> {
    const tier =
      await this.namespacesQuotaService.getNamespaceTier(namespaceId);
    return tier === NamespaceTier.PREMIUM ? 100 : 3;
  }

  private async retainedRevisions(
    resource: Resource,
  ): Promise<ResourceRevision[]> {
    return this.revisionRepository.find({
      where: { namespaceId: resource.namespaceId, resourceId: resource.id },
      select: {
        id: true,
        name: true,
        createdAt: true,
        author: { id: true, username: true },
      },
      relations: { author: true },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: (await this.historyLimit(resource.namespaceId)) + 1,
    });
  }

  async list(resource: Resource): Promise<ResourceRevisionSummary[]> {
    const revisions = await this.retainedRevisions(resource);
    if (!revisions.length) return [await this.current(resource)];
    return revisions.map((revision, index) => ({
      ...this.toSummary(revision),
      id: index === 0 ? 'current' : revision.id,
      isCurrent: index === 0,
    }));
  }

  async get(
    resource: Resource,
    revisionId: string,
  ): Promise<ResourceRevisionDetail | null> {
    const revisions = await this.retainedRevisions(resource);
    if (revisionId === 'current' && !revisions.length) {
      return this.current(resource);
    }
    const retained =
      revisionId === 'current'
        ? revisions[0]
        : revisions.find((revision) => revision.id === revisionId);
    if (!retained) return null;
    const revision = await this.revisionRepository.findOne({
      where: {
        id: retained.id,
        namespaceId: resource.namespaceId,
        resourceId: resource.id,
      },
      relations: { author: true },
    });
    return revision
      ? {
          ...this.toDetail(revision),
          id: revisionId,
          isCurrent: revision.id === revisions[0].id,
        }
      : null;
  }

  private contentHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  private async current(resource: Resource): Promise<ResourceRevisionDetail> {
    const currentAuthor = resource.userId
      ? await this.userRepository.findOne({ where: { id: resource.userId } })
      : null;
    return {
      id: 'current',
      resourceId: resource.id,
      name: resource.name,
      content: resource.content,
      contentHash: this.contentHash(resource.content ?? ''),
      createdAt: resource.updatedAt,
      author: currentAuthor ? this.author(currentAuthor) : null,
      isCurrent: true,
    };
  }

  private toSummary(revision: ResourceRevision): ResourceRevisionSummary {
    return {
      id: revision.id,
      name: revision.name,
      createdAt: revision.createdAt,
      author: revision.author ? this.author(revision.author) : null,
      isCurrent: false,
    };
  }

  private toDetail(revision: ResourceRevision): ResourceRevisionDetail {
    return {
      ...this.toSummary(revision),
      resourceId: revision.resourceId,
      content: revision.content,
      contentHash: revision.contentHash,
    };
  }

  private author(user: User): ResourceRevisionAuthor {
    return { id: user.id, username: user.username };
  }
}
