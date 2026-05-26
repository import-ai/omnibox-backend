import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddConversationPreferences1777000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'conversations',
      new TableColumn({
        name: 'preferences',
        type: 'jsonb',
        isNullable: true,
      }),
    );
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
