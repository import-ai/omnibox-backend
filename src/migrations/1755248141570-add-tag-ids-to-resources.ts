import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddTagIdsToResources1755248141570 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add tag_ids column to resources table
    await queryRunner.addColumn(
      'resources',
      new TableColumn({
        name: 'tag_ids',
        type: 'text',
        isArray: true,
        default: "'{}'",
      }),
    );

    // Migrate data from tags jsonb column to tag_ids text array
    await queryRunner.query(`
      UPDATE resources 
      SET tag_ids = ARRAY(
        SELECT jsonb_array_elements_text(tags)
      )
      WHERE tags IS NOT NULL AND jsonb_typeof(tags) = 'array'
    `);

    // Drop the old tags column
    await queryRunner.dropColumn('resources', 'tags');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Add back the tags jsonb column
    await queryRunner.addColumn(
      'resources',
      new TableColumn({
        name: 'tags',
        type: 'jsonb',
        default: "'[]'::jsonb",
      }),
    );

    // Migrate data back from tag_ids to tags jsonb
    await queryRunner.query(`
      UPDATE resources 
      SET tags = to_jsonb(tag_ids)
      WHERE tag_ids IS NOT NULL
    `);

    // Drop the tag_ids column
    await queryRunner.dropColumn('resources', 'tag_ids');
  }
}
