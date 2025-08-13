import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { BaseColumns } from './base-columns';

export class ResourceAttachments1755059371000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = new Table({
      name: 'resource_attachments',
      columns: [
        {
          name: 'id',
          type: 'bigserial',
          isPrimary: true,
        },
        {
          name: 'namespace_id',
          type: 'uuid',
          isNullable: false,
        },
        {
          name: 'resource_id',
          type: 'uuid',
          isNullable: false,
        },
        {
          name: 'attachment_id',
          type: 'character varying',
          isNullable: false,
        },
        ...BaseColumns(),
      ],
      indices: [
        {
          columnNames: ['namespace_id', 'resource_id', 'attachment_id'],
          isUnique: true,
          where: 'deleted_at IS NULL',
        },
      ],
      foreignKeys: [
        {
          columnNames: ['namespace_id'],
          referencedTableName: 'namespaces',
          referencedColumnNames: ['id'],
        },
        {
          columnNames: ['resource_id'],
          referencedTableName: 'resources',
          referencedColumnNames: ['id'],
        },
      ],
    });

    await queryRunner.createTable(table, true, true, true);
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
