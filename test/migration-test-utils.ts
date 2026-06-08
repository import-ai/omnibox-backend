import 'dotenv/config';

import { DataSource, QueryRunner } from 'typeorm';

export function getTestPostgresUrl(): string {
  const url = process.env.OBB_POSTGRES_URL;
  if (!url) {
    throw new Error('OBB_POSTGRES_URL is required for migration e2e tests');
  }
  return url;
}

export async function releaseQueryRunner(queryRunner?: QueryRunner) {
  if (!queryRunner) {
    return;
  }

  if (queryRunner.isTransactionActive) {
    await queryRunner.rollbackTransaction();
  }

  if (!queryRunner.isReleased) {
    await queryRunner.release();
  }
}

export async function destroyDataSource(dataSource?: DataSource) {
  if (dataSource?.isInitialized) {
    await dataSource.destroy();
  }
}
