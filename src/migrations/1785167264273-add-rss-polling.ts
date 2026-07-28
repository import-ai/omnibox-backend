import { MigrationInterface, QueryRunner, Table } from 'typeorm';

import { BaseColumns } from './base-columns';

export class AddRssPolling1785167264273 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE rss_poll_status AS ENUM ('polling', 'succeed', 'failed');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await this.createRssPollsTable(queryRunner);
    await this.createRssItemContentsTable(queryRunner);
  }

  private async createRssPollsTable(queryRunner: QueryRunner): Promise<void> {
    const existingTable = await queryRunner.getTable('rss_polls');
    if (existingTable) {
      return;
    }

    const table = new Table({
      name: 'rss_polls',
      columns: [
        {
          name: 'id',
          type: 'uuid',
          isPrimary: true,
          default: 'gen_random_uuid()',
        },
        {
          name: 'url',
          type: 'text',
          isNullable: false,
        },
        {
          name: 'status',
          type: 'enum',
          enumName: 'rss_poll_status',
          enum: ['polling', 'succeed', 'failed'],
          isNullable: false,
          default: "'polling'",
        },
        {
          name: 'content_ids',
          type: 'jsonb',
          isNullable: false,
          default: "'[]'::jsonb",
        },
        {
          name: 'error',
          type: 'text',
          isNullable: true,
        },
        ...BaseColumns(),
      ],
      indices: [
        {
          name: 'idx_rss_polls_url_created_at',
          columnNames: ['url', 'created_at'],
        },
      ],
    });

    await queryRunner.createTable(table, true, true, true);
  }

  private async createRssItemContentsTable(
    queryRunner: QueryRunner,
  ): Promise<void> {
    const existingTable = await queryRunner.getTable('rss_item_contents');
    if (existingTable) {
      return;
    }

    const table = new Table({
      name: 'rss_item_contents',
      columns: [
        {
          name: 'id',
          type: 'uuid',
          isPrimary: true,
          default: 'gen_random_uuid()',
        },
        {
          name: 'url',
          type: 'text',
          isNullable: false,
        },
        {
          name: 'guid',
          type: 'character varying',
          isNullable: false,
        },
        {
          name: 'content',
          type: 'text',
          isNullable: false,
        },
        ...BaseColumns(),
      ],
      indices: [
        {
          name: 'uq_rss_item_contents_url_guid',
          columnNames: ['url', 'guid'],
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
