import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddParseRetryToRssItemContents1785404258645 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('rss_item_contents');
    if (!table) {
      return;
    }

    // Existing rows default to zero attempts and no scheduled retry, so any row
    // still missing parsed content becomes eligible again on the next poll.
    if (!table.findColumnByName('parse_attempts')) {
      await queryRunner.addColumn(
        'rss_item_contents',
        new TableColumn({
          name: 'parse_attempts',
          type: 'integer',
          isNullable: false,
          default: '0',
        }),
      );
    }
    if (!table.findColumnByName('parse_next_attempt_at')) {
      await queryRunner.addColumn(
        'rss_item_contents',
        new TableColumn({
          name: 'parse_next_attempt_at',
          type: 'timestamp with time zone',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('rss_item_contents');
    if (table?.findColumnByName('parse_next_attempt_at')) {
      await queryRunner.dropColumn(
        'rss_item_contents',
        'parse_next_attempt_at',
      );
    }
    if (table?.findColumnByName('parse_attempts')) {
      await queryRunner.dropColumn('rss_item_contents', 'parse_attempts');
    }
  }
}
