import {
  destroyDataSource,
  getTestPostgresUrl,
  releaseQueryRunner,
} from 'test/migration-test-utils';
import { DataSource, QueryRunner } from 'typeorm';

import { DropRssItemStorageUsage1786645558020 } from './1786645558020-drop-rss-item-storage-usage';

describe('DropRssItemStorageUsage Migration E2E', () => {
  let dataSource: DataSource;
  let queryRunner: QueryRunner | undefined;

  const getQueryRunner = (): QueryRunner => {
    if (!queryRunner) {
      throw new Error('Query runner was not initialized');
    }
    return queryRunner;
  };

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: getTestPostgresUrl(),
      entities: [],
      migrations: [],
      synchronize: false,
    });
    await dataSource.initialize();
  });

  // Every case runs inside a transaction that is rolled back afterwards, so the
  // stand-in tables below never outlive the test.
  beforeEach(async () => {
    queryRunner = dataSource.createQueryRunner();
    await getQueryRunner().connect();
    await getQueryRunner().startTransaction();

    await getQueryRunner().query('DROP TABLE IF EXISTS resources CASCADE');
    await getQueryRunner().query('DROP TABLE IF EXISTS storage_usages CASCADE');
    await getQueryRunner().query(`
      CREATE TABLE resources (
        id character varying PRIMARY KEY,
        namespace_id character varying NOT NULL,
        user_id uuid,
        resource_type text NOT NULL DEFAULT 'doc',
        content_size bigint NOT NULL DEFAULT 0,
        deleted_at timestamp with time zone
      )
    `);
    await getQueryRunner().query(`
      CREATE TABLE storage_usages (
        id bigserial PRIMARY KEY,
        namespace_id character varying NOT NULL,
        user_id uuid NOT NULL,
        storage_type text NOT NULL,
        amount bigint NOT NULL DEFAULT 0,
        updated_at timestamp with time zone DEFAULT now(),
        deleted_at timestamp with time zone
      )
    `);
  });

  afterEach(async () => {
    await releaseQueryRunner(queryRunner);
  });

  afterAll(async () => {
    await destroyDataSource(dataSource);
  });

  const USER = '11111111-1111-1111-1111-111111111111';
  const OTHER_USER = '22222222-2222-2222-2222-222222222222';

  const addResource = async (
    id: string,
    props: {
      namespaceId?: string;
      userId?: string | null;
      resourceType?: string;
      contentSize: number;
      deleted?: boolean;
    },
  ) =>
    await getQueryRunner().query(
      `INSERT INTO resources
         (id, namespace_id, user_id, resource_type, content_size, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        id,
        props.namespaceId ?? 'ns1',
        props.userId === undefined ? USER : props.userId,
        props.resourceType ?? 'rss_item',
        props.contentSize,
        props.deleted ? new Date() : null,
      ],
    );

  const addUsage = async (
    amount: number,
    props: {
      namespaceId?: string;
      userId?: string;
      storageType?: string;
      deleted?: boolean;
    } = {},
  ) =>
    await getQueryRunner().query(
      `INSERT INTO storage_usages
         (namespace_id, user_id, storage_type, amount, deleted_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        props.namespaceId ?? 'ns1',
        props.userId ?? USER,
        props.storageType ?? 'content',
        amount,
        props.deleted ? new Date() : null,
      ],
    );

  const usages = async (): Promise<
    Array<{
      namespace_id: string;
      user_id: string;
      storage_type: string;
      amount: string;
    }>
  > =>
    await getQueryRunner().query(
      `SELECT namespace_id, user_id, storage_type, amount FROM storage_usages
        ORDER BY namespace_id, user_id, storage_type, amount`,
    );

  const run = async () =>
    await new DropRssItemStorageUsage1786645558020().up(getQueryRunner());

  it('takes the live item bytes back out, leaving the owner their own content', async () => {
    await addResource('doc1', { resourceType: 'doc', contentSize: 500 });
    await addResource('item1', { contentSize: 100 });
    await addResource('item2', { contentSize: 250 });
    await addUsage(850); // 500 of documents plus the 350 the items were charged

    await run();

    expect(await usages()).toEqual([
      expect.objectContaining({ storage_type: 'content', amount: '500' }),
    ]);
  });

  it('ignores retired items and items with no owner, which were never charged', async () => {
    await addResource('doc1', { resourceType: 'doc', contentSize: 500 });
    await addResource('item1', { contentSize: 100 });
    // Retired: its charge was already refunded when it was soft-deleted.
    await addResource('item2', { contentSize: 250, deleted: true });
    // Ownerless: nothing was ever charged for it.
    await addResource('item3', { contentSize: 400, userId: null });
    await addUsage(600);

    await run();

    expect(await usages()).toEqual([
      expect.objectContaining({ amount: '500' }),
    ]);
  });

  it('clamps at zero when the items are all the owner ever had', async () => {
    await addResource('item1', { contentSize: 1000 });
    await addUsage(1000);

    await run();

    expect(await usages()).toEqual([expect.objectContaining({ amount: '0' })]);
  });

  it('never takes more than the items could have put there', async () => {
    // A database whose items were never charged (the backfill and this
    // migration arriving in the same deployment): the recorded amount is
    // exactly the owner's own documents, so nothing may come off it.
    await addResource('doc1', { resourceType: 'doc', contentSize: 500 });
    await addResource('item1', { contentSize: 100_000 });
    await addUsage(500);

    await run();

    expect(await usages()).toEqual([
      expect.objectContaining({ amount: '500' }),
    ]);
  });

  it('leaves other owners, namespaces and storage types untouched', async () => {
    await addResource('item1', { contentSize: 100 });
    await addResource('item2', { namespaceId: 'ns2', contentSize: 700 });
    await addResource('item3', { userId: OTHER_USER, contentSize: 900 });
    await addUsage(100);
    await addUsage(300, { storageType: 'upload' });
    await addUsage(900, { namespaceId: 'ns2' });
    await addUsage(900, { userId: OTHER_USER });
    // A soft-deleted usage row is history and is not the live counter.
    await addUsage(100, { userId: OTHER_USER, deleted: true });

    await run();

    expect(await usages()).toEqual([
      // ns1 / USER: the 100 of items comes off content, upload is untouched.
      expect.objectContaining({
        namespace_id: 'ns1',
        user_id: USER,
        storage_type: 'content',
        amount: '0',
      }),
      expect.objectContaining({
        namespace_id: 'ns1',
        user_id: USER,
        storage_type: 'upload',
        amount: '300',
      }),
      // ns1 / OTHER_USER: their own 900 of items comes off the live row; the
      // soft-deleted row is history and keeps its amount.
      expect.objectContaining({
        namespace_id: 'ns1',
        user_id: OTHER_USER,
        amount: '0',
      }),
      expect.objectContaining({
        namespace_id: 'ns1',
        user_id: OTHER_USER,
        amount: '100',
      }),
      // ns2 is charged for its own item only; the owner's ns1 items are not
      // pooled into it.
      expect.objectContaining({
        namespace_id: 'ns2',
        user_id: USER,
        amount: '200',
      }),
    ]);
  });
});
