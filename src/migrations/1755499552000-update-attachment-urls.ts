import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateAttachmentUrls1755499552000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const batchSize = 100;
    let offset = 0;

    while (true) {
      const resources = await queryRunner.query(
        `
          SELECT id, content
          FROM resources
          WHERE content != '' AND deleted_at IS NULL
          ORDER BY id
            LIMIT $1
          OFFSET $2
        `,
        [batchSize, offset],
      );

      if (resources.length === 0) {
        break;
      }

      for (const resource of resources) {
        const originalContent = resource.content;

        // Replace /api/v1/attachments/images/{id} and
        // /api/v1/attachments/media/{id} with attachments/{id}
        const updatedContent = originalContent.replace(
          /\/api\/v1\/attachments\/(images|media)\/([a-zA-Z0-9._-]+)/g,
          'attachments/$2',
        );

        // Only update if content actually changed
        if (updatedContent !== originalContent) {
          await queryRunner.query(
            `UPDATE resources SET content = $1 WHERE id = $2`,
            [updatedContent, resource.id],
          );
        }
      }

      offset += batchSize;

      // If we got fewer resources than batch size, we're done
      if (resources.length < batchSize) {
        break;
      }
    }
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
