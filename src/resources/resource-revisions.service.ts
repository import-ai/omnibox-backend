import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { NamespacesQuotaService } from 'omniboxd/namespaces/namespaces-quota.service';
import { ResourceRevision } from 'omniboxd/resources/entities/resource-revision.entity';
import { Resource } from 'omniboxd/resources/entities/resource.entity';
import { Transaction } from 'omniboxd/utils/transaction-utils';
import { In, Repository } from 'typeorm';

export interface RevisionTrackedProps {
  name?: string;
  content?: string;
  tagIds?: string[];
}

const DEFAULT_REVISION_LIMIT = 3;

@Injectable()
export class ResourceRevisionsService {
  constructor(
    @InjectRepository(ResourceRevision)
    private readonly revisionRepository: Repository<ResourceRevision>,
    private readonly namespacesQuotaService: NamespacesQuotaService,
  ) {}

  async listRevisions(
    namespaceId: string,
    resourceId: string,
  ): Promise<ResourceRevision[]> {
    return await this.revisionRepository.find({
      where: { namespaceId, resourceId },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
  }

  async getRevision(
    namespaceId: string,
    resourceId: string,
    revisionId: string,
    tx: Transaction,
  ): Promise<ResourceRevision | null> {
    return await tx.entityManager.findOne(ResourceRevision, {
      where: { namespaceId, resourceId, id: revisionId },
    });
  }

  async createForUpdate(
    resource: Resource,
    nextProps: RevisionTrackedProps,
    userId: string,
    tx: Transaction,
  ): Promise<ResourceRevision | null> {
    if (!this.hasTrackedChanges(resource, nextProps)) {
      return null;
    }
    const revision = await this.createSnapshot(resource, userId, tx);
    await this.pruneRevisions(resource.namespaceId, resource.id, tx);
    return revision;
  }

  async createSnapshot(
    resource: Resource,
    userId: string,
    tx: Transaction,
  ): Promise<ResourceRevision> {
    const repo = tx.entityManager.getRepository(ResourceRevision);
    return await repo.save(
      repo.create({
        namespaceId: resource.namespaceId,
        resourceId: resource.id,
        updatedByUserId: userId || null,
        name: resource.name ?? '',
        content: resource.content ?? '',
        tagIds: resource.tagIds ?? [],
      }),
    );
  }

  async pruneRevisions(
    namespaceId: string,
    resourceId: string,
    tx: Transaction,
  ): Promise<void> {
    const repo = tx.entityManager.getRepository(ResourceRevision);
    const limit = await this.getRevisionLimit(namespaceId);
    const staleRevisions = await repo.find({
      select: ['id'],
      where: { namespaceId, resourceId },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: limit,
    });
    if (staleRevisions.length === 0) {
      return;
    }
    await repo.delete({
      id: In(staleRevisions.map((revision) => revision.id)),
    });
  }

  private async getRevisionLimit(namespaceId: string): Promise<number> {
    const usage =
      await this.namespacesQuotaService.getNamespaceUsage(namespaceId);
    const limit = usage.resourceRevisionLimit;
    if (!Number.isFinite(limit) || limit < 1) {
      return DEFAULT_REVISION_LIMIT;
    }
    return Math.floor(limit);
  }

  private hasTrackedChanges(
    resource: Resource,
    nextProps: RevisionTrackedProps,
  ): boolean {
    return (
      this.hasStringChange(resource.name, nextProps.name) ||
      this.hasStringChange(resource.content, nextProps.content) ||
      this.hasArrayChange(resource.tagIds ?? [], nextProps.tagIds)
    );
  }

  private hasStringChange(current: string, next?: string): boolean {
    return next !== undefined && next !== current;
  }

  private hasArrayChange(current: string[], next?: string[]): boolean {
    if (next === undefined) {
      return false;
    }
    return (
      current.length !== next.length || current.some((id, i) => id !== next[i])
    );
  }
}
