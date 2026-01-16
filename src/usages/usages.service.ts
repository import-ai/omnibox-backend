import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StorageUsage, StorageType } from './entities/storage-usage.entity';
import { Transaction } from 'omniboxd/utils/transaction-utils';

@Injectable()
export class UsagesService {
  constructor(
    @InjectRepository(StorageUsage)
    private readonly storageUsageRepository: Repository<StorageUsage>,
  ) {}

  /**
   * Update storage usage for content type
   * This method handles both increment and decrement operations
   */
  async updateContentUsage(
    namespaceId: string,
    userId: string,
    contentLength: number,
    tx?: Transaction,
  ): Promise<void> {
    const entityManager = tx
      ? tx.entityManager
      : this.storageUsageRepository.manager;

    const repo = entityManager.getRepository(StorageUsage);

    // Try to update existing record using SQL addition
    const updateResult = await repo
      .createQueryBuilder()
      .update(StorageUsage)
      .set({
        amount: () => `amount + ${contentLength}`,
      })
      .where('namespace_id = :namespaceId', { namespaceId })
      .andWhere('user_id = :userId', { userId })
      .andWhere('storage_type = :storageType', {
        storageType: StorageType.CONTENT,
      })
      .andWhere('deleted_at IS NULL')
      .execute();

    // If no record was updated, create a new one
    if (updateResult.affected === 0) {
      await repo.save(
        repo.create({
          namespaceId,
          userId,
          storageType: StorageType.CONTENT,
          amount: contentLength,
        }),
      );
    }
  }

  /**
   * Get storage usage for a specific user and namespace
   */
  async getUsage(
    namespaceId: string,
    userId: string,
    storageType: StorageType,
  ): Promise<StorageUsage | null> {
    return await this.storageUsageRepository.findOne({
      where: {
        namespaceId,
        userId,
        storageType,
      },
    });
  }
}
