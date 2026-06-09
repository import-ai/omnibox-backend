import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { numberToBigintString } from 'omniboxd/utils/bigint-utils';
import { Transaction } from 'omniboxd/utils/transaction-utils';
import { Repository } from 'typeorm';

import { StorageType, StorageUsage } from './entities/storage-usage.entity';

@Injectable()
export class StorageUsagesService {
  constructor(
    @InjectRepository(StorageUsage)
    private readonly storageUsageRepository: Repository<StorageUsage>,
  ) {}

  async updateStorageUsage(
    namespaceId: string,
    userId: string,
    storageType: StorageType,
    amount: number,
    tx?: Transaction,
  ): Promise<void> {
    const repo = tx
      ? tx.entityManager.getRepository(StorageUsage)
      : this.storageUsageRepository;

    const updateResult = await repo.increment(
      {
        namespaceId,
        userId,
        storageType,
      },
      'amount',
      amount,
    );

    if (updateResult.affected === 0) {
      await repo.save(
        repo.create({
          namespaceId,
          userId,
          storageType,
          amount: numberToBigintString(amount),
        }),
      );
    }
  }

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
