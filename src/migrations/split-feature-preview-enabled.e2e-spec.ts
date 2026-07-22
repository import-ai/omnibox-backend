import {
  destroyDataSource,
  getTestPostgresUrl,
  releaseQueryRunner,
} from 'test/migration-test-utils';
import { DataSource, QueryRunner } from 'typeorm';

import { SplitFeaturePreviewEnabled1784710706445 } from './1784710706445-split-feature-preview-enabled';

describe('SplitFeaturePreviewEnabled Migration E2E', () => {
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
    await queryRunner.query('CREATE SCHEMA split_feature_preview_enabled_test');
    await queryRunner.query(
      'SET LOCAL search_path TO split_feature_preview_enabled_test',
    );
    await queryRunner.query(`
      CREATE TABLE feature_previews (
        id bigserial PRIMARY KEY,
        enabled boolean NOT NULL DEFAULT false
      )
    `);
  });

  afterEach(async () => {
    await releaseQueryRunner(queryRunner);
  });

  afterAll(async () => {
    await destroyDataSource(dataSource);
  });

  it('should preserve enabled values and create nullable split columns', async () => {
    await queryRunner.query(`
      INSERT INTO feature_previews (enabled) VALUES (true), (false)
    `);

    await new SplitFeaturePreviewEnabled1784710706445().up(queryRunner);

    const columns = await queryRunner.query(`
      SELECT column_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'feature_previews'
        AND column_name IN ('enabled', 'user_enabled', 'rollout_enabled')
      ORDER BY column_name
    `);
    expect(columns).toEqual([
      {
        column_name: 'rollout_enabled',
        is_nullable: 'YES',
        column_default: null,
      },
      {
        column_name: 'user_enabled',
        is_nullable: 'YES',
        column_default: null,
      },
    ]);

    const rows = await queryRunner.query(`
      SELECT user_enabled, rollout_enabled
      FROM feature_previews
      ORDER BY id
    `);
    expect(rows).toEqual([
      { user_enabled: true, rollout_enabled: null },
      { user_enabled: false, rollout_enabled: null },
    ]);
  });
});
