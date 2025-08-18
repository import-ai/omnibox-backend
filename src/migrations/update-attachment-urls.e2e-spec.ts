import { DataSource, QueryRunner } from 'typeorm';
import { UpdateAttachmentUrls1755499552000 } from './1755499552000-update-attachment-urls';

// Import all prior migrations in chronological order
import { Init1751900000000 } from './1751900000000-init';
import { UserOptions1751904560034 } from './1751904560034-user-options';
import { Tags1751905414493 } from './1751905414493-tags';
import { UserBindings1752652489640 } from './1752652489640-user-bindings.ts';
import { NullUserEmail1752814358259 } from './1752814358259-null-user-email';
import { Shares1753866547335 } from './1753866547335-shares';
import { ApiKeys1754550165406 } from './1754550165406-api-keys';
import { ResourceAttachments1755059371000 } from './1755059371000-resource-attachments';
import { AddTagIdsToResources1755248141570 } from './1755248141570-add-tag-ids-to-resources';
import { CleanResourceNames1755396702021 } from './1755396702021-clean-resource-names';

describe('UpdateAttachmentUrls Migration E2E', () => {
  let dataSource: DataSource;
  let queryRunner: QueryRunner;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: process.env.OBB_POSTGRES_URL,
      entities: [],
      migrations: [
        Init1751900000000,
        UserOptions1751904560034,
        Tags1751905414493,
        UserBindings1752652489640,
        NullUserEmail1752814358259,
        Shares1753866547335,
        ApiKeys1754550165406,
        ResourceAttachments1755059371000,
        AddTagIdsToResources1755248141570,
        CleanResourceNames1755396702021,
      ],
      synchronize: false,
      migrationsRun: false,
    });
    await dataSource.initialize();

    // Enable UUID extension
    await dataSource.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    // Run migrations manually
    await dataSource.runMigrations();
  });

  beforeEach(async () => {
    queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    // Create a test namespace that resources can reference
    await queryRunner.query(`
      INSERT INTO namespaces (id, name) VALUES ('test-ns', 'Test Namespace')
      ON CONFLICT (id) DO NOTHING
    `);
  });

  afterEach(async () => {
    await queryRunner.rollbackTransaction();
    await queryRunner.release();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  describe('URL replacement functionality', () => {
    it('should replace /api/v1/attachments/images/ URLs with attachments/', async () => {
      // Setup: Insert resources with old-style image attachment URLs
      await queryRunner.query(`
        INSERT INTO resources (id, name, namespace_id, resource_type, content) VALUES
        ('res1', 'Test Document 1', 'test-ns', 'doc', 'Here is an image: /api/v1/attachments/images/abc123.jpg'),
        ('res2', 'Test Document 2', 'test-ns', 'doc', 'Multiple images: /api/v1/attachments/images/test1.png and /api/v1/attachments/images/test2.gif'),
        ('res3', 'Test Document 3', 'test-ns', 'doc', 'No attachments here')
      `);

      // Execute migration
      const migration = new UpdateAttachmentUrls1755499552000();
      await migration.up(queryRunner);

      // Verify results
      const results = await queryRunner.query(`
        SELECT id, content FROM resources ORDER BY id
      `);

      expect(results).toEqual([
        { id: 'res1', content: 'Here is an image: attachments/abc123.jpg' },
        {
          id: 'res2',
          content:
            'Multiple images: attachments/test1.png and attachments/test2.gif',
        },
        { id: 'res3', content: 'No attachments here' },
      ]);
    });

    it('should replace /api/v1/attachments/media/ URLs with attachments/', async () => {
      // Setup: Insert resources with old-style media attachment URLs
      await queryRunner.query(`
        INSERT INTO resources (id, name, namespace_id, resource_type, content) VALUES
        ('res1', 'Audio Document', 'test-ns', 'doc', 'Audio file: /api/v1/attachments/media/audio123.wav'),
        ('res2', 'Video Document', 'test-ns', 'doc', 'Video: /api/v1/attachments/media/video456.mp4'),
        ('res3', 'Mixed Media', 'test-ns', 'doc', 'Mixed: /api/v1/attachments/images/pic.jpg and /api/v1/attachments/media/sound.mp3')
      `);

      // Execute migration
      const migration = new UpdateAttachmentUrls1755499552000();
      await migration.up(queryRunner);

      // Verify results
      const results = await queryRunner.query(`
        SELECT id, content FROM resources ORDER BY id
      `);

      expect(results).toEqual([
        { id: 'res1', content: 'Audio file: attachments/audio123.wav' },
        { id: 'res2', content: 'Video: attachments/video456.mp4' },
        {
          id: 'res3',
          content: 'Mixed: attachments/pic.jpg and attachments/sound.mp3',
        },
      ]);
    });

    it('should handle various file extensions', async () => {
      // Setup: Insert resources with different file types
      await queryRunner.query(`
        INSERT INTO resources (id, name, namespace_id, resource_type, content) VALUES
        ('res1', 'Multi-format', 'test-ns', 'doc',
         'Images: /api/v1/attachments/images/photo.jpeg /api/v1/attachments/images/diagram.svg
          Audio: /api/v1/attachments/media/music.mp3 /api/v1/attachments/media/podcast.flac
          Video: /api/v1/attachments/media/clip.avi /api/v1/attachments/media/demo.webm
          Documents: /api/v1/attachments/images/scan.pdf /api/v1/attachments/media/data.json')
      `);

      // Execute migration
      const migration = new UpdateAttachmentUrls1755499552000();
      await migration.up(queryRunner);

      // Verify results
      const results = await queryRunner.query(`
        SELECT content FROM resources WHERE id = 'res1'
      `);

      const expectedContent = `Images: attachments/photo.jpeg attachments/diagram.svg
          Audio: attachments/music.mp3 attachments/podcast.flac
          Video: attachments/clip.avi attachments/demo.webm
          Documents: attachments/scan.pdf attachments/data.json`;

      expect(results[0].content).toBe(expectedContent);
    });

    it('should not affect already converted URLs', async () => {
      // Setup: Insert resources with mix of old and new URLs
      await queryRunner.query(`
        INSERT INTO resources (id, name, namespace_id, resource_type, content) VALUES
        ('res1', 'Mixed URLs', 'test-ns', 'doc',
         'Old: /api/v1/attachments/images/old.jpg New: attachments/new.png Already converted: attachments/existing.gif')
      `);

      // Execute migration
      const migration = new UpdateAttachmentUrls1755499552000();
      await migration.up(queryRunner);

      // Verify results
      const results = await queryRunner.query(`
        SELECT content FROM resources WHERE id = 'res1'
      `);

      expect(results[0].content).toBe(
        'Old: attachments/old.jpg New: attachments/new.png Already converted: attachments/existing.gif',
      );
    });

    it('should not affect other /api/v1/ URLs', async () => {
      // Setup: Insert resources with other API URLs that should not be changed
      await queryRunner.query(`
        INSERT INTO resources (id, name, namespace_id, resource_type, content) VALUES
        ('res1', 'Other APIs', 'test-ns', 'doc',
         'These should not change: /api/v1/resources/123 /api/v1/auth/login /api/v1/users/profile
          But this should: /api/v1/attachments/images/photo.jpg
          And this: /api/v1/attachments/media/video.mp4')
      `);

      // Execute migration
      const migration = new UpdateAttachmentUrls1755499552000();
      await migration.up(queryRunner);

      // Verify results
      const results = await queryRunner.query(`
        SELECT content FROM resources WHERE id = 'res1'
      `);

      expect(results[0].content).toBe(
        'These should not change: /api/v1/resources/123 /api/v1/auth/login /api/v1/users/profile\n          But this should: attachments/photo.jpg\n          And this: attachments/video.mp4',
      );
    });
  });

  describe('Batch processing', () => {
    it('should handle large number of resources in batches', async () => {
      // Setup: Insert 250 resources (more than 2 batches of 100)
      const insertPromises: Promise<any>[] = [];
      for (let i = 1; i <= 250; i++) {
        insertPromises.push(
          queryRunner.query(
            `
            INSERT INTO resources (id, name, namespace_id, resource_type, content) VALUES
            ($1, $2, 'test-ns', 'doc', $3)
          `,
            [
              `res${i.toString().padStart(3, '0')}`,
              `Resource ${i}`,
              i % 3 === 0
                ? `Content with /api/v1/attachments/images/file${i}.jpg`
                : i % 5 === 0
                  ? `Content with /api/v1/attachments/media/audio${i}.wav`
                  : `Regular content without attachments ${i}`,
            ],
          ),
        );
      }
      await Promise.all(insertPromises);

      // Execute migration
      const migration = new UpdateAttachmentUrls1755499552000();
      await migration.up(queryRunner);

      // Verify a sample of results
      const convertedImageResources = await queryRunner.query(`
        SELECT COUNT(*) as count FROM resources
        WHERE content LIKE '%attachments/file%.jpg%'
      `);

      const convertedAudioResources = await queryRunner.query(`
        SELECT COUNT(*) as count FROM resources
        WHERE content LIKE '%attachments/audio%.wav%'
      `);

      const unconvertedResources = await queryRunner.query(`
        SELECT COUNT(*) as count FROM resources
        WHERE content LIKE '%/api/v1/attachments/%'
      `);

      // Should have converted all resources with attachments
      expect(parseInt(convertedImageResources[0].count)).toBeGreaterThan(0);
      expect(parseInt(convertedAudioResources[0].count)).toBeGreaterThan(0);
      expect(parseInt(unconvertedResources[0].count)).toBe(0);

      // Verify total count is still 250
      const totalResources = await queryRunner.query(`
        SELECT COUNT(*) as count FROM resources
      `);
      expect(parseInt(totalResources[0].count)).toBe(250);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty content gracefully', async () => {
      // Setup: Insert resources with empty or null content
      await queryRunner.query(`
        INSERT INTO resources (id, name, namespace_id, resource_type, content) VALUES
        ('res1', 'Empty Content', 'test-ns', 'doc', ''),
        ('res2', 'Normal Content', 'test-ns', 'doc', 'Some content with /api/v1/attachments/images/test.jpg')
      `);

      // Execute migration
      const migration = new UpdateAttachmentUrls1755499552000();
      await migration.up(queryRunner);

      // Verify results
      const results = await queryRunner.query(`
        SELECT id, content FROM resources ORDER BY id
      `);

      expect(results).toEqual([
        { id: 'res1', content: '' },
        { id: 'res2', content: 'Some content with attachments/test.jpg' },
      ]);
    });

    it('should handle deleted resources by skipping them', async () => {
      // Setup: Insert both active and deleted resources
      await queryRunner.query(`
        INSERT INTO resources (id, name, namespace_id, resource_type, content, deleted_at) VALUES
        ('res1', 'Active Resource', 'test-ns', 'doc', 'Content with /api/v1/attachments/images/active.jpg', NULL),
        ('res2', 'Deleted Resource', 'test-ns', 'doc', 'Content with /api/v1/attachments/images/deleted.jpg', NOW())
      `);

      // Execute migration
      const migration = new UpdateAttachmentUrls1755499552000();
      await migration.up(queryRunner);

      // Verify results
      const results = await queryRunner.query(`
        SELECT id, content, deleted_at FROM resources ORDER BY id
      `);

      // Active resource should be updated, deleted resource should be unchanged
      expect(results[0].content).toBe('Content with attachments/active.jpg');
      expect(results[0].deleted_at).toBe(null);

      expect(results[1].content).toBe(
        'Content with /api/v1/attachments/images/deleted.jpg',
      );
      expect(results[1].deleted_at).not.toBe(null);
    });

    it('should handle complex filenames with underscores and hyphens', async () => {
      // Setup: Insert resources with complex filename patterns
      await queryRunner.query(`
        INSERT INTO resources (id, name, namespace_id, resource_type, content) VALUES
        ('res1', 'Complex Filenames', 'test-ns', 'doc',
         'Files: /api/v1/attachments/images/file-with-hyphens.png
          /api/v1/attachments/media/file_with_underscores.mp4
          /api/v1/attachments/images/MiXeD_CaSe-File123.jpeg
          /api/v1/attachments/media/very-long_filename-with-123_numbers.webm')
      `);

      // Execute migration
      const migration = new UpdateAttachmentUrls1755499552000();
      await migration.up(queryRunner);

      // Verify results
      const results = await queryRunner.query(`
        SELECT content FROM resources WHERE id = 'res1'
      `);

      const expectedContent = `Files: attachments/file-with-hyphens.png
          attachments/file_with_underscores.mp4
          attachments/MiXeD_CaSe-File123.jpeg
          attachments/very-long_filename-with-123_numbers.webm`;

      expect(results[0].content).toBe(expectedContent);
    });
  });

  describe('Migration idempotency', () => {
    it('should be safe to run multiple times', async () => {
      // Setup: Insert resources with old URLs
      await queryRunner.query(`
        INSERT INTO resources (id, name, namespace_id, resource_type, content) VALUES
        ('res1', 'Test Resource', 'test-ns', 'doc', 'Image: /api/v1/attachments/images/test.jpg')
      `);

      // Execute migration first time
      const migration1 = new UpdateAttachmentUrls1755499552000();
      await migration1.up(queryRunner);

      // Get result after first run
      let results = await queryRunner.query(`
        SELECT content FROM resources WHERE id = 'res1'
      `);
      const afterFirstRun = results[0].content;

      // Execute migration second time
      const migration2 = new UpdateAttachmentUrls1755499552000();
      await migration2.up(queryRunner);

      // Get result after second run
      results = await queryRunner.query(`
        SELECT content FROM resources WHERE id = 'res1'
      `);
      const afterSecondRun = results[0].content;

      // Should be identical - migration is idempotent
      expect(afterFirstRun).toBe('Image: attachments/test.jpg');
      expect(afterSecondRun).toBe(afterFirstRun);
    });
  });
});
