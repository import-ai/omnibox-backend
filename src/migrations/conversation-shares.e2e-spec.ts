import {
  destroyDataSource,
  getTestPostgresUrl,
  releaseQueryRunner,
} from 'test/migration-test-utils';
import { DataSource, QueryRunner } from 'typeorm';

import { ConversationShares1781600000000 } from './1781600000000-conversation-shares';

describe('ConversationShares Migration E2E', () => {
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

  it('supports a down and up round trip', async () => {
    const migration = new ConversationShares1781600000000();

    await migration.down(queryRunner);
    await migration.up(queryRunner);
    await migration.down(queryRunner);
    await migration.up(queryRunner);

    const tables = await queryRunner.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name IN (
          'conversation_shares',
          'conversation_share_groups',
          'conversation_share_events'
        )
      ORDER BY table_name
    `);
    expect(tables).toEqual([
      { table_name: 'conversation_share_events' },
      { table_name: 'conversation_share_groups' },
      { table_name: 'conversation_shares' },
    ]);
  });
});
