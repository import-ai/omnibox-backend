import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class AddResourceRevisions1790094055950 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE resources
        ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0),
        ADD COLUMN revision_created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ADD COLUMN revision_author_id uuid REFERENCES users(id) ON DELETE SET NULL;
      UPDATE resources SET revision_created_at = updated_at;
    `);

    await queryRunner.createTable(
      new Table({
        name: 'resource_revisions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          { name: 'namespace_id', type: 'character varying' },
          { name: 'resource_id', type: 'character varying' },
          { name: 'version', type: 'integer' },
          { name: 'author_id', type: 'uuid', isNullable: true },
          { name: 'name', type: 'character varying' },
          { name: 'content', type: 'text' },
          { name: 'created_at', type: 'timestamptz' },
        ],
        foreignKeys: [
          {
            columnNames: ['namespace_id'],
            referencedTableName: 'namespaces',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            columnNames: ['resource_id'],
            referencedTableName: 'resources',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            columnNames: ['author_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
        ],
      }),
      true,
      true,
      true,
    );
    await queryRunner.createIndex(
      'resource_revisions',
      new TableIndex({
        name: 'idx_resource_revisions_resource_version',
        columnNames: ['namespace_id', 'resource_id', 'version'],
        isUnique: true,
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('resource_revisions');
    await queryRunner.query(`
      ALTER TABLE resources
        DROP COLUMN revision_author_id,
        DROP COLUMN revision_created_at,
        DROP COLUMN version;
    `);
  }
}
