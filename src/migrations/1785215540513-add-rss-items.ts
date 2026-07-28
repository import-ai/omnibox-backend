import { MigrationInterface, QueryRunner, Table } from 'typeorm';

import { BaseColumns } from './base-columns';

export class AddRssItems1785215540513 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const existingTable = await queryRunner.getTable('rss_items');
    if (existingTable) {
      return;
    }

    const table = new Table({
      name: 'rss_items',
      columns: [
        {
          name: 'id',
          type: 'uuid',
          isPrimary: true,
          default: 'gen_random_uuid()',
        },
        {
          name: 'link_id',
          type: 'uuid',
          isNullable: false,
        },
        {
          name: 'content_id',
          type: 'uuid',
          isNullable: false,
        },
        {
          name: 'title',
          type: 'text',
          isNullable: false,
        },
        ...BaseColumns(),
      ],
      foreignKeys: [
        {
          columnNames: ['link_id'],
          referencedTableName: 'rss_links',
          referencedColumnNames: ['id'],
        },
        {
          columnNames: ['content_id'],
          referencedTableName: 'rss_item_contents',
          referencedColumnNames: ['id'],
        },
      ],
      indices: [
        {
          name: 'uq_rss_items_link_content',
          columnNames: ['link_id', 'content_id'],
          isUnique: true,
        },
      ],
    });

    await queryRunner.createTable(table, true, true, true);
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
