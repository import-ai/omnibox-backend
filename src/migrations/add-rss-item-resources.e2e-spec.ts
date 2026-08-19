import {
  destroyDataSource,
  getTestPostgresUrl,
  releaseQueryRunner,
} from 'test/migration-test-utils';
import { DataSource, QueryRunner } from 'typeorm';

import { AddRssItemResources1786534451795 } from './1786534451795-add-rss-item-resources';

// Covers the backfill only, not up(): up() commits its surrounding transaction
// around the `ALTER TYPE ... ADD VALUE`, which would take the stand-in tables
// below out of this spec's rollback and leave them on the test database. The
// backfill is where every row and every task is written, and it runs entirely
// inside the caller's transaction.
const backfill = (queryRunner: QueryRunner) =>
  (
    new AddRssItemResources1786534451795() as unknown as {
      backfill: (queryRunner: QueryRunner) => Promise<void>;
    }
  ).backfill(queryRunner);

describe('AddRssItemResources Migration E2E', () => {
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

    for (const table of [
      'resources',
      'tasks',
      'rss_items',
      'rss_links',
      'rss_item_contents',
    ]) {
      await getQueryRunner().query(`DROP TABLE IF EXISTS ${table} CASCADE`);
    }
    await getQueryRunner().query(`
      CREATE TABLE resources (
        id character varying PRIMARY KEY,
        namespace_id character varying NOT NULL,
        user_id uuid,
        parent_id character varying,
        name character varying NOT NULL DEFAULT '',
        resource_type text NOT NULL DEFAULT 'doc',
        content text,
        content_size bigint NOT NULL DEFAULT 0,
        attrs jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now(),
        deleted_at timestamp with time zone
      )
    `);
    await getQueryRunner().query(`
      CREATE TABLE tasks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        namespace_id character varying NOT NULL,
        user_id uuid NOT NULL,
        priority bigint NOT NULL DEFAULT 5,
        function character varying NOT NULL,
        input jsonb NOT NULL,
        payload jsonb,
        resource_id character varying,
        status text NOT NULL DEFAULT 'pending',
        created_at timestamp with time zone NOT NULL DEFAULT now()
      )
    `);
    await getQueryRunner().query(`
      CREATE TABLE rss_links (
        id character varying PRIMARY KEY,
        url text NOT NULL,
        resource_id character varying NOT NULL
      )
    `);
    await getQueryRunner().query(`
      CREATE TABLE rss_item_contents (
        id character varying PRIMARY KEY,
        url text NOT NULL,
        guid character varying NOT NULL,
        content text,
        parsed_content text
      )
    `);
    await getQueryRunner().query(`
      CREATE TABLE rss_items (
        id character varying PRIMARY KEY,
        link_id character varying NOT NULL,
        content_id character varying NOT NULL,
        title text,
        pub_date timestamp with time zone,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now(),
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
  const FEED = 'https://example.com/feed';

  // One legacy item: its folder resource, the link it hangs off, the shared
  // content row and the join row itself.
  const addLegacyItem = async (
    key: string,
    props: {
      parsedContent?: string | null;
      snippet?: string | null;
      userId?: string | null;
      deleted?: boolean;
    } = {},
  ) => {
    await getQueryRunner().query(
      `INSERT INTO resources (id, namespace_id, user_id, name, resource_type)
       VALUES ($1, 'ns1', $2, $3, 'rss_folder')`,
      [
        `folder-${key}`,
        props.userId === undefined ? USER : props.userId,
        `Folder ${key}`,
      ],
    );
    await getQueryRunner().query(
      `INSERT INTO rss_links (id, url, resource_id) VALUES ($1, $2, $3)`,
      [`link-${key}`, FEED, `folder-${key}`],
    );
    await getQueryRunner().query(
      `INSERT INTO rss_item_contents (id, url, guid, content, parsed_content)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        `content-${key}`,
        FEED,
        `guid-${key}`,
        JSON.stringify({
          link: `https://example.com/${key}`,
          contentSnippet: props.snippet ?? null,
        }),
        props.parsedContent === undefined ? `# ${key}` : props.parsedContent,
      ],
    );
    await getQueryRunner().query(
      `INSERT INTO rss_items (id, link_id, content_id, title, deleted_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        `item-${key}`,
        `link-${key}`,
        `content-${key}`,
        `Title ${key}`,
        props.deleted ? new Date() : null,
      ],
    );
  };

  const items = async (): Promise<
    Array<{ id: string; name: string; content: string | null }>
  > =>
    await getQueryRunner().query(
      `SELECT id, name, content FROM resources
        WHERE resource_type = 'rss_item' ORDER BY name`,
    );

  const tasks = async (): Promise<
    Array<{
      namespace_id: string;
      user_id: string;
      priority: string;
      function: string;
      input: Record<string, any>;
      payload: Record<string, any>;
      resource_id: string;
      status: string;
    }>
  > => await getQueryRunner().query(`SELECT * FROM tasks ORDER BY resource_id`);

  it('emits an index task for every item it backfills', async () => {
    await addLegacyItem('a');
    await addLegacyItem('b');

    await backfill(getQueryRunner());

    const backfilled = await items();
    expect(backfilled).toHaveLength(2);
    const emitted = await tasks();
    expect(emitted).toHaveLength(2);
    expect(emitted.map((task) => task.resource_id).sort()).toEqual(
      backfilled.map((item) => item.id).sort(),
    );
  });

  it('emits what the wizard indexer expects, below the live path priority', async () => {
    await addLegacyItem('a');

    await backfill(getQueryRunner());

    const [item] = await items();
    const [task] = await tasks();
    expect(task).toEqual(
      expect.objectContaining({
        namespace_id: 'ns1',
        user_id: USER,
        function: 'upsert_index',
        // Ordinary user work (priority 5) outranks a backfill of a long feed
        // history.
        priority: '1',
        status: 'pending',
        resource_id: item.id,
        payload: { resource_id: item.id },
      }),
    );
    expect(task.input).toEqual({
      title: 'Title a',
      content: '# a',
      meta_info: {
        user_id: USER,
        resource_id: item.id,
        parent_id: 'folder-a',
        resource_tag_ids: [],
        resource_tag_names: [],
      },
    });
  });

  it('indexes the feed snippet when the item was never parsed', async () => {
    await addLegacyItem('a', { parsedContent: null, snippet: 'a snippet' });

    await backfill(getQueryRunner());

    const [task] = await tasks();
    expect(task.input.content).toBe('a snippet');
  });

  it('skips items the live path would skip: trashed, ownerless or empty', async () => {
    await addLegacyItem('trashed', { deleted: true });
    await addLegacyItem('ownerless', { userId: null });
    await addLegacyItem('empty', { parsedContent: null, snippet: null });
    await addLegacyItem('indexable');

    await backfill(getQueryRunner());

    // All four are still materialized as resources; only the indexable one is
    // queued for the search index.
    expect(await items()).toHaveLength(4);
    const emitted = await tasks();
    expect(emitted).toHaveLength(1);
    expect(emitted[0].input.title).toBe('Title indexable');
  });
});
