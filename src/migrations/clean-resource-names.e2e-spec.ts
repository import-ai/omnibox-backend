import { DataSource, QueryRunner } from 'typeorm';
import { CleanResourceNames1755396702021 } from './1755396702021-clean-resource-names';

describe('CleanResourceNames Migration E2E', () => {
  let dataSource: DataSource;
  let queryRunner: QueryRunner;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: process.env.OBB_POSTGRES_URL,
      entities: [],
      migrations: [],
      synchronize: false,
    });
    await dataSource.initialize();
  });

  beforeEach(async () => {
    queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    await queryRunner.query('DROP TABLE IF EXISTS resources CASCADE');

    // Create resources table structure for testing
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS resources (
        id character varying PRIMARY KEY,
        name character varying NOT NULL DEFAULT '',
        namespace_id character varying NOT NULL DEFAULT 'test-ns',
        user_id uuid,
        parent_id character varying,
        resource_type text NOT NULL DEFAULT 'doc',
        content text NOT NULL DEFAULT '',
        tags jsonb NOT NULL DEFAULT '[]'::jsonb,
        attrs jsonb NOT NULL DEFAULT '{}'::jsonb,
        global_permission text,
        created_at timestamp with time zone DEFAULT now(),
        updated_at timestamp with time zone DEFAULT now(),
        deleted_at timestamp with time zone
      )
    `);
  });

  afterEach(async () => {
    await queryRunner.rollbackTransaction();
    await queryRunner.release();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  describe('URL-encoded names', () => {
    it('should decode URL-encoded resource names', async () => {
      // Setup: Insert URL-encoded names
      await queryRunner.query(`
        INSERT INTO resources (id, name) VALUES 
        ('res1', 'Hello%20World'),
        ('res2', 'My%20Document%2Etxt'),
        ('res3', 'Normal Name'),
        ('res4', 'File%2Bwith%2Bplus')
      `);

      // Execute migration
      const migration = new CleanResourceNames1755396702021();
      await migration.up(queryRunner);

      // Verify results
      const results = await queryRunner.query(`
        SELECT id, name FROM resources ORDER BY id
      `);

      expect(results).toEqual([
        { id: 'res1', name: 'Hello World' },
        { id: 'res2', name: 'My Document.txt' },
        { id: 'res3', name: 'Normal Name' },
        { id: 'res4', name: 'File+with+plus' },
      ]);
    });

    it('should handle double-encoded names', async () => {
      await queryRunner.query(`
        INSERT INTO resources (id, name) VALUES 
        ('res1', 'Hello%2520World')
      `);

      const migration = new CleanResourceNames1755396702021();
      await migration.up(queryRunner);

      const results = await queryRunner.query(`
        SELECT name FROM resources WHERE id = 'res1'
      `);

      expect(results[0].name).toBe('Hello%20World');
    });
  });

  describe('Mojibake names', () => {
    it('should fix mojibake text', async () => {
      // Setup: Insert mojibake names (UTF-8 bytes interpreted as Latin-1)
      const mojibakeText = Buffer.from('Café', 'utf8').toString('latin1');

      await queryRunner.query(
        `
        INSERT INTO resources (id, name) VALUES 
        ('res1', $1),
        ('res2', 'Normal Text')
      `,
        [mojibakeText],
      );

      // Execute migration
      const migration = new CleanResourceNames1755396702021();
      await migration.up(queryRunner);

      // Verify results
      const results = await queryRunner.query(`
        SELECT id, name FROM resources ORDER BY id
      `);

      expect(results[0].name).toBe('Café');
      expect(results[1].name).toBe('Normal Text');
    });
  });

  describe('Combined issues', () => {
    it('should handle URL-encoded mojibake', async () => {
      // Create a name that's both URL-encoded AND has mojibake
      const text = '我为什么给你OFFER：跟着名企HR找工作.md';
      const mojibakeText = Buffer.from(text, 'utf8').toString('latin1');
      const urlEncodedMojibake = encodeURIComponent(mojibakeText);

      await queryRunner.query(
        `
        INSERT INTO resources (id, name) VALUES 
        ('res1', $1)
      `,
        [urlEncodedMojibake],
      );

      const migration = new CleanResourceNames1755396702021();
      await migration.up(queryRunner);

      const results = await queryRunner.query(`
        SELECT name FROM resources WHERE id = 'res1'
      `);

      expect(results[0].name).toBe(text);
    });
  });

  describe('Edge cases', () => {
    it('should not modify already clean names', async () => {
      await queryRunner.query(`
        INSERT INTO resources (id, name) VALUES 
        ('res1', 'Clean Name'),
        ('res2', 'Another Clean Name 123'),
        ('res3', 'With-Special_Chars.txt'),
        ('res4', '中文测试')
      `);

      const migration = new CleanResourceNames1755396702021();
      await migration.up(queryRunner);

      const results = await queryRunner.query(`
        SELECT name FROM resources ORDER BY id
      `);

      expect(results[0].name).toBe('Clean Name');
      expect(results[1].name).toBe('Another Clean Name 123');
      expect(results[2].name).toBe('With-Special_Chars.txt');
      expect(results[3].name).toBe('中文测试');
    });

    it('should handle empty and null names gracefully', async () => {
      await queryRunner.query(`
        INSERT INTO resources (id, name) VALUES 
        ('res1', ''),
        ('res2', 'Valid Name')
      `);

      const migration = new CleanResourceNames1755396702021();
      await migration.up(queryRunner);

      const results = await queryRunner.query(`
        SELECT name FROM resources ORDER BY id
      `);

      expect(results[0].name).toBe('');
      expect(results[1].name).toBe('Valid Name');
    });
  });
});
