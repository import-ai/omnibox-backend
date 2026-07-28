import { MigrationInterface, QueryRunner, Table } from 'typeorm';

import { BaseColumns } from './base-columns';

export class AddRssLinks1785152612959 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE resource_type ADD VALUE IF NOT EXISTS 'rss_folder'
    `);

    const existingTable = await queryRunner.getTable('rss_links');
    if (existingTable) {
      return;
    }

    const table = new Table({
      name: 'rss_links',
      columns: [
        {
          name: 'id',
          type: 'uuid',
          isPrimary: true,
          default: 'gen_random_uuid()',
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
          name: 'index',
          type: 'integer',
          isNullable: false,
        },
        {
          name: 'url',
          type: 'text',
          isNullable: false,
        },
        {
          name: 'name',
          type: 'character varying',
          isNullable: false,
          default: "''",
        },
        ...BaseColumns(),
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
      indices: [
        {
          name: 'idx_rss_links_resource',
          columnNames: ['resource_id', 'index'],
        },
      ],
    });

    await queryRunner.createTable(table, true, true, true);
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
