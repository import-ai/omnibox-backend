import { DataSource, QueryRunner } from 'typeorm';
import { ScanResourceAttachments1755504936756 } from './1755504936756-scan-resource-attachments';

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
import { UpdateAttachmentUrls1755499552000 } from './1755499552000-update-attachment-urls';

describe('ScanResourceAttachments Migration E2E', () => {
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
        UpdateAttachmentUrls1755499552000,
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

  describe('Attachment relation creation', () => {
    it('should create resource-attachment relations for single attachment', async () => {
      // Setup: Insert resource with attachment reference
      await queryRunner.query(`
        INSERT INTO resources (id, name, namespace_id, resource_type, content) VALUES
        ('res1', 'Test Document', 'test-ns', 'doc', 'Here is an image: attachments/abc123.jpg')
      `);

      // Execute migration
      const migration = new ScanResourceAttachments1755504936756();
      await migration.up(queryRunner);

      // Verify resource_attachments table entry was created
      const relations = await queryRunner.query(`
        SELECT namespace_id, resource_id, attachment_id FROM resource_attachments
        WHERE namespace_id = 'test-ns' AND resource_id = 'res1'
        ORDER BY attachment_id
      `);

      expect(relations).toEqual([
        {
          namespace_id: 'test-ns',
          resource_id: 'res1',
          attachment_id: 'abc123.jpg',
        },
      ]);
    });

    it('should create multiple resource-attachment relations for multiple attachments', async () => {
      // Setup: Insert resource with multiple attachment references
      await queryRunner.query(`
        INSERT INTO resources (id, name, namespace_id, resource_type, content) VALUES
        ('res1', 'Multi-attachment Doc', 'test-ns', 'doc',
         'Images: attachments/photo1.png and attachments/photo2.gif
          Audio: attachments/sound.wav
          Video: attachments/clip.mp4')
      `);

      // Execute migration
      const migration = new ScanResourceAttachments1755504936756();
      await migration.up(queryRunner);

      // Verify all relations were created
      const relations = await queryRunner.query(`
        SELECT attachment_id FROM resource_attachments
        WHERE namespace_id = 'test-ns' AND resource_id = 'res1'
        ORDER BY attachment_id
      `);

      expect(relations.map((r) => r.attachment_id)).toEqual([
        'clip.mp4',
        'photo1.png',
        'photo2.gif',
        'sound.wav',
      ]);
    });

    it('should handle various file extensions correctly', async () => {
      // Setup: Insert resource with different file types
      await queryRunner.query(`
        INSERT INTO resources (id, name, namespace_id, resource_type, content) VALUES
        ('res1', 'Various Extensions', 'test-ns', 'doc',
         'Files: attachments/image.jpeg attachments/doc.pdf attachments/audio.mp3
          attachments/video.webm attachments/data.json attachments/archive.zip
          attachments/drawing.svg attachments/presentation.pptx')
      `);

      // Execute migration
      const migration = new ScanResourceAttachments1755504936756();
      await migration.up(queryRunner);

      // Verify all relations were created
      const relations = await queryRunner.query(`
        SELECT attachment_id FROM resource_attachments
        WHERE namespace_id = 'test-ns' AND resource_id = 'res1'
        ORDER BY attachment_id
      `);

      expect(relations.map((r) => r.attachment_id)).toEqual([
        'archive.zip',
        'audio.mp3',
        'data.json',
        'doc.pdf',
        'drawing.svg',
        'image.jpeg',
        'presentation.pptx',
        'video.webm',
      ]);
    });

    it('should handle complex filenames with underscores and hyphens', async () => {
      // Setup: Insert resource with complex attachment filenames
      await queryRunner.query(`
        INSERT INTO resources (id, name, namespace_id, resource_type, content) VALUES
        ('res1', 'Complex Filenames', 'test-ns', 'doc',
         'Files: attachments/file-with-hyphens.png attachments/file_with_underscores.jpg
          attachments/MiXeD_CaSe-File123.jpeg attachments/very-long_filename-with-123_numbers.webm')
      `);

      // Execute migration
      const migration = new ScanResourceAttachments1755504936756();
      await migration.up(queryRunner);

      // Verify all relations were created
      const relations = await queryRunner.query(`
        SELECT attachment_id FROM resource_attachments
        WHERE namespace_id = 'test-ns' AND resource_id = 'res1'
        ORDER BY attachment_id
      `);

      expect(relations.map((r) => r.attachment_id)).toEqual([
        'file-with-hyphens.png',
        'file_with_underscores.jpg',
        'MiXeD_CaSe-File123.jpeg',
        'very-long_filename-with-123_numbers.webm',
      ]);
    });
  });

  describe('Batch processing', () => {
    it('should handle large number of resources in batches', async () => {
      // Setup: Insert 250 resources with attachments (more than 2 batches of 100)
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
                ? `Content with attachments/file${i}.jpg`
                : i % 5 === 0
                  ? `Content with attachments/audio${i}.wav`
                  : `Regular content without attachments ${i}`,
            ],
          ),
        );
      }
      await Promise.all(insertPromises);

      // Execute migration
      const migration = new ScanResourceAttachments1755504936756();
      await migration.up(queryRunner);

      // Verify relations were created for resources with attachments
      const imageRelations = await queryRunner.query(`
        SELECT COUNT(*) as count FROM resource_attachments
        WHERE attachment_id LIKE 'file%.jpg'
      `);

      const audioRelations = await queryRunner.query(`
        SELECT COUNT(*) as count FROM resource_attachments
        WHERE attachment_id LIKE 'audio%.wav'
      `);

      // Should have created relations for resources divisible by 3 and 5
      expect(parseInt(imageRelations[0].count)).toBeGreaterThan(0);
      expect(parseInt(audioRelations[0].count)).toBeGreaterThan(0);

      // Verify no relations were created for resources without attachments
      const totalRelations = await queryRunner.query(`
        SELECT COUNT(*) as count FROM resource_attachments
      `);

      // Should have relations only for resources with attachments (every 3rd and every 5th)
      const expectedWithAttachments =
        Math.floor(250 / 3) + Math.floor(250 / 5) - Math.floor(250 / 15); // Include-exclude principle
      expect(parseInt(totalRelations[0].count)).toBe(expectedWithAttachments);
    });
  });

  describe('Duplicate handling', () => {
    it('should not create duplicate relations for same attachment referenced multiple times', async () => {
      // Setup: Insert resource with same attachment referenced multiple times
      await queryRunner.query(`
        INSERT INTO resources (id, name, namespace_id, resource_type, content) VALUES
        ('res1', 'Duplicate References', 'test-ns', 'doc',
         'Image used twice: attachments/duplicate.jpg and again attachments/duplicate.jpg
          And once more: attachments/duplicate.jpg')
      `);

      // Execute migration
      const migration = new ScanResourceAttachments1755504936756();
      await migration.up(queryRunner);

      // Verify only one relation was created despite multiple references
      const relations = await queryRunner.query(`
        SELECT COUNT(*) as count FROM resource_attachments
        WHERE namespace_id = 'test-ns' AND resource_id = 'res1' AND attachment_id = 'duplicate.jpg'
      `);

      expect(parseInt(relations[0].count)).toBe(1); // Migration deduplicates - only creates one relation even with multiple references
    });

    it('should not create relation if it already exists', async () => {
      // Setup: Insert resource and pre-create the relation
      await queryRunner.query(`
        INSERT INTO resources (id, name, namespace_id, resource_type, content) VALUES
        ('res1', 'Existing Relation', 'test-ns', 'doc', 'Image: attachments/existing.jpg')
      `);

      await queryRunner.query(`
        INSERT INTO resource_attachments (namespace_id, resource_id, attachment_id) VALUES
        ('test-ns', 'res1', 'existing.jpg')
      `);

      // Count relations before migration
      const beforeCount = await queryRunner.query(`
        SELECT COUNT(*) as count FROM resource_attachments
        WHERE namespace_id = 'test-ns' AND resource_id = 'res1' AND attachment_id = 'existing.jpg'
      `);

      // Execute migration
      const migration = new ScanResourceAttachments1755504936756();
      await migration.up(queryRunner);

      // Count relations after migration - should be the same
      const afterCount = await queryRunner.query(`
        SELECT COUNT(*) as count FROM resource_attachments
        WHERE namespace_id = 'test-ns' AND resource_id = 'res1' AND attachment_id = 'existing.jpg'
      `);

      expect(parseInt(beforeCount[0].count)).toBe(1);
      expect(parseInt(afterCount[0].count)).toBe(1); // Should not have created duplicate
    });
  });

  describe('Edge cases', () => {
    it('should handle resources with no attachments', async () => {
      // Setup: Insert resource without any attachments
      await queryRunner.query(`
        INSERT INTO resources (id, name, namespace_id, resource_type, content) VALUES
        ('res1', 'No Attachments', 'test-ns', 'doc', 'Just some regular text with no attachments')
      `);

      // Execute migration
      const migration = new ScanResourceAttachments1755504936756();
      await migration.up(queryRunner);

      // Verify no relations were created
      const relations = await queryRunner.query(`
        SELECT COUNT(*) as count FROM resource_attachments
        WHERE namespace_id = 'test-ns' AND resource_id = 'res1'
      `);

      expect(parseInt(relations[0].count)).toBe(0);
    });

    it('should handle empty content gracefully', async () => {
      // Setup: Insert resource with empty content
      await queryRunner.query(`
        INSERT INTO resources (id, name, namespace_id, resource_type, content) VALUES
        ('res1', 'Empty Content', 'test-ns', 'doc', ''),
        ('res2', 'With Attachment', 'test-ns', 'doc', 'Image: attachments/test.jpg')
      `);

      // Execute migration
      const migration = new ScanResourceAttachments1755504936756();
      await migration.up(queryRunner);

      // Verify no relations for empty content, but relation exists for resource with attachment
      const emptyRelations = await queryRunner.query(`
        SELECT COUNT(*) as count FROM resource_attachments
        WHERE resource_id = 'res1'
      `);

      const withAttachmentRelations = await queryRunner.query(`
        SELECT COUNT(*) as count FROM resource_attachments
        WHERE resource_id = 'res2'
      `);

      expect(parseInt(emptyRelations[0].count)).toBe(0);
      expect(parseInt(withAttachmentRelations[0].count)).toBe(1);
    });

    it('should process all resource types but skip deleted resources', async () => {
      // Setup: Insert various resource types and deleted resources
      await queryRunner.query(`
        INSERT INTO resources (id, name, namespace_id, resource_type, content, deleted_at) VALUES
        ('res1', 'Doc Resource', 'test-ns', 'doc', 'Image: attachments/doc.jpg', NULL),
        ('res2', 'Folder Resource', 'test-ns', 'folder', 'Image: attachments/folder.jpg', NULL),
        ('res3', 'Deleted Doc', 'test-ns', 'doc', 'Image: attachments/deleted.jpg', NOW())
      `);

      // Execute migration
      const migration = new ScanResourceAttachments1755504936756();
      await migration.up(queryRunner);

      // Verify all non-deleted resources got processed (regardless of type)
      const relations = await queryRunner.query(`
        SELECT resource_id, attachment_id FROM resource_attachments
        ORDER BY resource_id
      `);

      expect(relations).toEqual([
        { resource_id: 'res1', attachment_id: 'doc.jpg' },
        { resource_id: 'res2', attachment_id: 'folder.jpg' },
      ]);
    });

    it('should handle resources across different namespaces', async () => {
      // Setup: Create another namespace and insert resources in both
      await queryRunner.query(`
        INSERT INTO namespaces (id, name) VALUES ('other-ns', 'Other Namespace')
        ON CONFLICT (id) DO NOTHING
      `);

      await queryRunner.query(`
        INSERT INTO resources (id, name, namespace_id, resource_type, content) VALUES
        ('res1', 'Resource in test-ns', 'test-ns', 'doc', 'Image: attachments/test-ns.jpg'),
        ('res2', 'Resource in other-ns', 'other-ns', 'doc', 'Image: attachments/other-ns.jpg')
      `);

      // Execute migration
      const migration = new ScanResourceAttachments1755504936756();
      await migration.up(queryRunner);

      // Verify relations were created with correct namespace_id
      const testNsRelations = await queryRunner.query(`
        SELECT namespace_id, resource_id, attachment_id FROM resource_attachments
        WHERE namespace_id = 'test-ns'
      `);

      const otherNsRelations = await queryRunner.query(`
        SELECT namespace_id, resource_id, attachment_id FROM resource_attachments
        WHERE namespace_id = 'other-ns'
      `);

      expect(testNsRelations).toEqual([
        {
          namespace_id: 'test-ns',
          resource_id: 'res1',
          attachment_id: 'test-ns.jpg',
        },
      ]);

      expect(otherNsRelations).toEqual([
        {
          namespace_id: 'other-ns',
          resource_id: 'res2',
          attachment_id: 'other-ns.jpg',
        },
      ]);
    });
  });

  describe('Migration idempotency', () => {
    it('should be safe to run multiple times', async () => {
      // Setup: Insert resource with attachment
      await queryRunner.query(`
        INSERT INTO resources (id, name, namespace_id, resource_type, content) VALUES
        ('res1', 'Test Resource', 'test-ns', 'doc', 'Image: attachments/test.jpg')
      `);

      // Execute migration first time
      const migration1 = new ScanResourceAttachments1755504936756();
      await migration1.up(queryRunner);

      // Count relations after first run
      const afterFirstRun = await queryRunner.query(`
        SELECT COUNT(*) as count FROM resource_attachments
        WHERE namespace_id = 'test-ns' AND resource_id = 'res1'
      `);

      // Execute migration second time
      const migration2 = new ScanResourceAttachments1755504936756();
      await migration2.up(queryRunner);

      // Count relations after second run
      const afterSecondRun = await queryRunner.query(`
        SELECT COUNT(*) as count FROM resource_attachments
        WHERE namespace_id = 'test-ns' AND resource_id = 'res1'
      `);

      // Should be identical - migration is idempotent
      expect(parseInt(afterFirstRun[0].count)).toBe(1);
      expect(parseInt(afterSecondRun[0].count)).toBe(1);
    });
  });
});
