import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddPubDateAndTitleToRssTables1785238404377 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const items = await queryRunner.getTable('rss_items');
    if (items && !items.findColumnByName('pub_date')) {
      await queryRunner.addColumn(
        'rss_items',
        new TableColumn({
          name: 'pub_date',
          type: 'timestamp with time zone',
          isNullable: true,
        }),
      );
    }

    const contents = await queryRunner.getTable('rss_item_contents');
    if (contents && !contents.findColumnByName('title')) {
      await queryRunner.addColumn(
        'rss_item_contents',
        new TableColumn({
          name: 'title',
          type: 'text',
          isNullable: true,
        }),
      );
    }
    if (contents && !contents.findColumnByName('pub_date')) {
      await queryRunner.addColumn(
        'rss_item_contents',
        new TableColumn({
          name: 'pub_date',
          type: 'timestamp with time zone',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const contents = await queryRunner.getTable('rss_item_contents');
    if (contents?.findColumnByName('pub_date')) {
      await queryRunner.dropColumn('rss_item_contents', 'pub_date');
    }
    if (contents?.findColumnByName('title')) {
      await queryRunner.dropColumn('rss_item_contents', 'title');
    }

    const items = await queryRunner.getTable('rss_items');
    if (items?.findColumnByName('pub_date')) {
      await queryRunner.dropColumn('rss_items', 'pub_date');
    }
  }
}
