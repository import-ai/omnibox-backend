import { MigrationInterface, QueryRunner } from 'typeorm';

export class ScanResourceAttachments1755504936756
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const batchSize = 100;
    let offset = 0;

    while (true) {
      const resources = await queryRunner.query(
        `
        SELECT id, namespace_id, content
        FROM resources
        WHERE content != '' AND deleted_at IS NULL
        ORDER BY id
        LIMIT $1 OFFSET $2
      `,
        [batchSize, offset],
      );

      if (resources.length === 0) {
        break;
      }

      for (const resource of resources) {
        const content = resource.content;

        // Find all attachment references in the format: attachments/{id}
        const attachmentMatches = content.match(
          /attachments\/([a-zA-Z0-9\._-]+)/g,
        );

        for (const match of attachmentMatches || []) {
          // Extract attachment ID from the match (remove "attachments/" prefix only)
          const attachmentId = match.replace('attachments/', '');

          // Check if this resource-attachment relation already exists
          const existingRelation = await queryRunner.query(
            `
              SELECT id FROM resource_attachments
              WHERE namespace_id = $1 AND resource_id = $2 AND attachment_id = $3 AND deleted_at IS NULL
              `,
            [resource.namespace_id, resource.id, attachmentId],
          );

          // Only create the relation if it doesn't exist
          if (existingRelation.length === 0) {
            await queryRunner.query(
              `
                INSERT INTO resource_attachments (namespace_id, resource_id, attachment_id)
                VALUES ($1, $2, $3)
                `,
              [resource.namespace_id, resource.id, attachmentId],
            );
          }
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
