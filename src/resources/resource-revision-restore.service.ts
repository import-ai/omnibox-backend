import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { ResourceRevision } from 'omniboxd/resources/entities/resource-revision.entity';
import { Resource } from 'omniboxd/resources/entities/resource.entity';
import { ResourceRevisionsService } from 'omniboxd/resources/resource-revisions.service';
import { StorageType } from 'omniboxd/storage-usages/entities/storage-usage.entity';
import { StorageUsagesService } from 'omniboxd/storage-usages/storage-usages.service';
import { WizardTaskService } from 'omniboxd/tasks/wizard-task.service';
import {
  bigintStringToNumber,
  numberToBigintString,
} from 'omniboxd/utils/bigint-utils';
import { Transaction, transaction } from 'omniboxd/utils/transaction-utils';
import { I18nService } from 'nestjs-i18n';
import { DataSource, EntityManager } from 'typeorm';

const TASK_PRIORITY = 5;

@Injectable()
export class ResourceRevisionRestoreService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly revisionsService: ResourceRevisionsService,
    private readonly storageUsagesService: StorageUsagesService,
    private readonly wizardTaskService: WizardTaskService,
    private readonly i18n: I18nService,
  ) {}

  async restoreRevision(
    namespaceId: string,
    resourceId: string,
    revisionId: string,
    userId: string,
    tx?: Transaction,
  ): Promise<void> {
    if (!tx) {
      return await transaction(this.dataSource.manager, (tx) =>
        this.restoreRevision(namespaceId, resourceId, revisionId, userId, tx),
      );
    }

    const resource = await this.getLockedResourceOrFail(
      namespaceId,
      resourceId,
      tx.entityManager,
    );
    const revision = await this.getRevisionOrFail(
      namespaceId,
      resourceId,
      revisionId,
      tx,
    );

    await this.ensureRevisionNameAvailable(
      resource,
      revision,
      tx.entityManager,
    );
    await this.applyRevisionSnapshot(resource, revision, userId, tx);
  }

  private async getLockedResourceOrFail(
    namespaceId: string,
    resourceId: string,
    entityManager: EntityManager,
  ): Promise<Resource> {
    const resource = await entityManager.getRepository(Resource).findOne({
      where: { namespaceId, id: resourceId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!resource) {
      const message = this.i18n.t('resource.errors.resourceNotFound');
      throw new AppException(
        message,
        'RESOURCE_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    return resource;
  }

  private async getRevisionOrFail(
    namespaceId: string,
    resourceId: string,
    revisionId: string,
    tx: Transaction,
  ): Promise<ResourceRevision> {
    const revision = await this.revisionsService.getRevision(
      namespaceId,
      resourceId,
      revisionId,
      tx,
    );
    if (!revision) {
      const message = this.i18n.t('resource.errors.revisionNotFound');
      throw new AppException(
        message,
        'RESOURCE_REVISION_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    return revision;
  }

  private async ensureRevisionNameAvailable(
    resource: Resource,
    revision: ResourceRevision,
    entityManager: EntityManager,
  ): Promise<void> {
    if (resource.name === revision.name) {
      return;
    }
    const count = await this.countNameConflicts(
      resource,
      revision,
      entityManager,
    );
    if (count > 0) {
      const message = this.i18n.t('resource.errors.resourceNameConflict');
      throw new AppException(
        message,
        'RESOURCE_NAME_CONFLICT',
        HttpStatus.CONFLICT,
      );
    }
  }

  private async countNameConflicts(
    resource: Resource,
    revision: ResourceRevision,
    entityManager: EntityManager,
  ): Promise<number> {
    return await entityManager
      .getRepository(Resource)
      .createQueryBuilder('resource')
      .where('resource.namespace_id = :namespaceId', {
        namespaceId: resource.namespaceId,
      })
      .andWhere('resource.parent_id IS NOT DISTINCT FROM :parentId', {
        parentId: resource.parentId,
      })
      .andWhere('LOWER(resource.name) = LOWER(:name)', {
        name: revision.name,
      })
      .andWhere('resource.deleted_at IS NULL')
      .andWhere('resource.id != :excludeId', { excludeId: resource.id })
      .getCount();
  }

  private async applyRevisionSnapshot(
    resource: Resource,
    revision: ResourceRevision,
    userId: string,
    tx: Transaction,
  ): Promise<void> {
    if (this.isSameRevisionSnapshot(resource, revision)) {
      return;
    }

    await this.revisionsService.createSnapshot(resource, userId, tx);
    await this.revisionsService.pruneRevisions(
      resource.namespaceId,
      resource.id,
      tx,
    );

    const contentSize = Buffer.byteLength(revision.content, 'utf8');
    await tx.entityManager.update(
      Resource,
      { namespaceId: resource.namespaceId, id: resource.id },
      {
        name: revision.name,
        content: revision.content,
        tagIds: revision.tagIds,
        contentSize: numberToBigintString(contentSize),
      },
    );

    await this.updateContentStorageForRestore(resource, contentSize, tx);
    await this.emitIndexTaskAfterRestore(resource, userId, tx);
  }

  private isSameRevisionSnapshot(
    resource: Resource,
    revision: ResourceRevision,
  ): boolean {
    return (
      resource.name === revision.name &&
      resource.content === revision.content &&
      this.stableStringify(resource.tagIds ?? []) ===
        this.stableStringify(revision.tagIds ?? [])
    );
  }

  private async updateContentStorageForRestore(
    resource: Resource,
    contentSize: number,
    tx: Transaction,
  ): Promise<void> {
    if (!resource.userId) {
      return;
    }
    const contentSizeDiff =
      contentSize - bigintStringToNumber(resource.contentSize);
    if (contentSizeDiff === 0) {
      return;
    }
    await this.storageUsagesService.updateStorageUsage(
      resource.namespaceId,
      resource.userId,
      StorageType.CONTENT,
      contentSizeDiff,
      tx,
    );
  }

  private async emitIndexTaskAfterRestore(
    resource: Resource,
    userId: string,
    tx: Transaction,
  ): Promise<void> {
    if (!resource.parentId) {
      return;
    }
    const restoredResource = await tx.entityManager.findOneOrFail(Resource, {
      where: { namespaceId: resource.namespaceId, id: resource.id },
    });
    await this.wizardTaskService.emitUpsertIndexTask(
      TASK_PRIORITY,
      userId,
      restoredResource,
      tx,
    );
  }

  private stableStringify(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record).sort();
      return `{${keys
        .map(
          (key) =>
            `${JSON.stringify(key)}:${this.stableStringify(record[key])}`,
        )
        .join(',')}}`;
    }
    return JSON.stringify(value) ?? 'undefined';
  }
}
