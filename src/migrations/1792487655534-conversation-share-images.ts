import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class ConversationShareImages1792487655534 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'conversation_share_groups',
      new TableColumn({
        name: 'question_images',
        type: 'jsonb',
        isNullable: false,
        default: "'[]'",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn(
      'conversation_share_groups',
      'question_images',
    );
  }
}
