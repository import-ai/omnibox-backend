import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableForeignKey,
} from 'typeorm';

export class AddShareIdToConversations1757844449000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'conversations',
      new TableColumn({
        name: 'share_id',
        type: 'varchar',
        isNullable: true,
      }),
    );

    await queryRunner.createForeignKey(
      'conversations',
      new TableForeignKey({
        columnNames: ['share_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'shares',
      }),
    );
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
