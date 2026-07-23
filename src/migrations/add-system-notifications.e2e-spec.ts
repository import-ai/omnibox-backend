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
  });

  afterEach(async () => {
    await releaseQueryRunner(queryRunner);
  });

  afterAll(async () => {
    await destroyDataSource(dataSource);
  });

  it('should remove global notifications before restoring the old constraint', async () => {
    const notificationId = '11111111-1111-1111-1111-111111111111';
    await queryRunner.query(
      `
        INSERT INTO notifications (id, is_global, title, notification_type)
        VALUES ($1, true, 'System notification', 'system')
      `,
      [notificationId],
    );

    const migration = new AddSystemNotifications1784803893255();
    await expect(migration.down(queryRunner)).resolves.not.toThrow();

    const rows = await queryRunner.query(
      'SELECT id FROM notifications WHERE id = $1',
      [notificationId],
    );
    expect(rows).toEqual([]);

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
