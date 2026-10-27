import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class ConversationShareResourceImages1792496161554 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'conversation_share_groups',
      new TableColumn({
        name: 'resource_images',
        type: 'jsonb',
        isNullable: false,
        default: "'[]'",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn(
      'conversation_share_groups',
      'resource_images',
    );
  }
}
