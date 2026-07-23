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
      CREATE TABLE notifications (
        id uuid PRIMARY KEY,
        user_id uuid,
        namespace_id character varying,
        is_global boolean NOT NULL DEFAULT false,
        dedup_key uuid UNIQUE,
        created_at timestamp with time zone DEFAULT now(),
        deleted_at timestamp with time zone,
        CONSTRAINT chk_notifications_receiver CHECK (
          (is_global = true AND user_id IS NULL AND namespace_id IS NULL)
          OR (is_global = false AND (user_id IS NOT NULL OR namespace_id IS NOT NULL))
        )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_notifications_global_created_at
      ON notifications (is_global, created_at)
      WHERE deleted_at IS NULL
    `);
    await queryRunner.query(`
      CREATE TABLE notification_reads (
        id uuid PRIMARY KEY
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
    await queryRunner.query(
      `
        INSERT INTO notifications (id, user_id, is_global) VALUES
          ('22222222-2222-2222-2222-222222222222', $1, false),
          ('33333333-3333-3333-3333-333333333333', NULL, true)
      `,
      [userId],
    );

    const migration = new AddSystemNotifications1784803893255();
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
