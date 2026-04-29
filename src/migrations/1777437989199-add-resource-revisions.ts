import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class AddResourceRevisions1777437989199 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'resource_revisions',
        columns: [
          {
            name: 'id',
            type: 'character varying',
            isPrimary: true,
          },
          {
            name: 'namespace_id',
            type: 'character varying',
            isNullable: false,
          },
          {
            name: 'resource_id',
            type: 'character varying',
            isNullable: false,
          },
          {
            name: 'updated_by_user_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'name',
            type: 'character varying',
            isNullable: false,
            default: "''",
          },
          {
            name: 'content',
            type: 'text',
            isNullable: false,
            default: "''",
          },
          {
            name: 'tag_ids',
            type: 'text',
            isArray: true,
            isNullable: false,
            default: "'{}'",
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            isNullable: false,
            default: 'now()',
          },
        ],
      }),
      true,
      true,
      true,
    );

    await queryRunner.createForeignKeys('resource_revisions', [
      new TableForeignKey({
        columnNames: ['namespace_id'],
        referencedTableName: 'namespaces',
        referencedColumnNames: ['id'],
      }),
      new TableForeignKey({
        columnNames: ['resource_id'],
        referencedTableName: 'resources',
        referencedColumnNames: ['id'],
      }),
      new TableForeignKey({
        columnNames: ['updated_by_user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
      }),
    ]);

    await queryRunner.createIndex(
      'resource_revisions',
      new TableIndex({
        columnNames: ['namespace_id', 'resource_id', 'created_at'],
      }),
    );
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
