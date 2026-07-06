import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddIsRecommendedToConversations1783343362776 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'conversations',
      new TableColumn({
        name: 'is_recommended',
        type: 'boolean',
        isNullable: false,
        default: false,
      }),
    );
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
