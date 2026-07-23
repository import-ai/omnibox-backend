import {
  destroyDataSource,
  getTestPostgresUrl,
  releaseQueryRunner,
} from 'test/migration-test-utils';
import { DataSource, QueryRunner } from 'typeorm';

import { AddSystemNotifications1784803893255 } from './1784803893255-add-system-notifications';

describe('AddSystemNotifications Migration E2E', () => {
  let dataSource: DataSource;
  let queryRunner: QueryRunner;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: getTestPostgresUrl(),
      entities: [],
      synchronize: false,
    });
    await dataSource.initialize();
  });

  beforeEach(async () => {
    queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    await queryRunner.query('CREATE SCHEMA add_system_notifications_test');
    await queryRunner.query(
      'SET LOCAL search_path TO add_system_notifications_test, public',
    );
    await queryRunner.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY
      )
    `);
    await queryRunner.query(`
      CREATE TABLE notifications (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id uuid,
        namespace_id character varying,
        created_at timestamp with time zone DEFAULT now(),
        deleted_at timestamp with time zone,
        CONSTRAINT chk_notifications_user_or_namespace
          CHECK (user_id IS NOT NULL OR namespace_id IS NOT NULL)
      )
    `);
  });

  afterEach(async () => {
    await releaseQueryRunner(queryRunner);
  });

  afterAll(async () => {
    await destroyDataSource(dataSource);
  });

  it('should remove global notifications before restoring the old constraint', async () => {
    const userId = '11111111-1111-1111-1111-111111111111';
    await queryRunner.query('INSERT INTO notifications (user_id) VALUES ($1)', [
      userId,
    ]);

    const migration = new AddSystemNotifications1784803893255();
    await migration.up(queryRunner);
    await queryRunner.query(
      'INSERT INTO notifications (is_global) VALUES (true)',
    );

    await expect(migration.down(queryRunner)).resolves.not.toThrow();

    const rows = await queryRunner.query(`
      SELECT user_id, namespace_id
      FROM notifications
      ORDER BY user_id NULLS LAST
    `);
    expect(rows).toEqual([{ user_id: userId, namespace_id: null }]);

    const removedColumns = await queryRunner.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'notifications'
        AND column_name IN ('is_global', 'dedup_key')
    `);
    expect(removedColumns).toEqual([]);

    const checks = await queryRunner.query(`
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'notifications'::regclass
        AND contype = 'c'
    `);
    expect(checks).toEqual([
      { conname: 'chk_notifications_user_or_namespace' },
    ]);
  });
});
