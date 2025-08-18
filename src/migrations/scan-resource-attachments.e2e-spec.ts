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

    // Create a test namespace specific to this migration test
    await queryRunner.query(`
      INSERT INTO namespaces (id, name) VALUES ('scan-resource-attachments-test', 'ScanResourceAttachments Migration Test')
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
        ('res1', 'Test Document', 'scan-resource-attachments-test', 'doc', 'Here is an image: attachments/abc123.jpg')
      `);

      // Execute migration
      const migration = new ScanResourceAttachments1755504936756();
      await migration.up(queryRunner);

      // Verify resource_attachments table entry was created for our specific resource
      const relations = await queryRunner.query(`
        SELECT namespace_id, resource_id, attachment_id FROM resource_attachments
        WHERE namespace_id = 'scan-resource-attachments-test' AND resource_id = 'res1' AND attachment_id = 'abc123.jpg'
        ORDER BY attachment_id
      `);

      expect(relations).toHaveLength(1);
      expect(relations[0]).toEqual({
        namespace_id: 'scan-resource-attachments-test',
        resource_id: 'res1',
        attachment_id: 'abc123.jpg',
      });
    });

    it('should create multiple resource-attachment relations for multiple attachments', async () => {
      // Setup: Insert resource with multiple attachment references
      await queryRunner.query(`
        INSERT INTO resources (id, name, namespace_id, resource_type, content) VALUES
        ('res1', 'Multi-attachment Doc', 'scan-resource-attachments-test', 'doc',
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
        WHERE namespace_id = 'scan-resource-attachments-test' AND resource_id = 'res1'
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
        ('res1', 'Various Extensions', 'scan-resource-attachments-test', 'doc',
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
        WHERE namespace_id = 'scan-resource-attachments-test' AND resource_id = 'res1'
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
        ('res1', 'Complex Filenames', 'scan-resource-attachments-test', 'doc',
         'Files: attachments/file-with-hyphens.png attachments/file_with_underscores.jpg
          attachments/MiXeD_CaSe-File123.jpeg attachments/very-long_filename-with-123_numbers.webm')
      `);

      // Execute migration
      const migration = new ScanResourceAttachments1755504936756();
      await migration.up(queryRunner);

      // Verify all relations were created
      const relations = await queryRunner.query(`
        SELECT attachment_id FROM resource_attachments
        WHERE namespace_id = 'scan-resource-attachments-test' AND resource_id = 'res1'
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
});
