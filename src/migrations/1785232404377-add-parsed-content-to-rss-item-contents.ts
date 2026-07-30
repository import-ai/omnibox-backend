import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddParsedContentToRssItemContents1785232404377 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('rss_item_contents');
    if (!table || table.findColumnByName('parsed_content')) {
      return;
    }

    await queryRunner.addColumn(
      'rss_item_contents',
      new TableColumn({
        name: 'parsed_content',
        type: 'text',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('rss_item_contents');
    if (!table?.findColumnByName('parsed_content')) {
      return;
    }

    await queryRunner.dropColumn('rss_item_contents', 'parsed_content');
  }
}
