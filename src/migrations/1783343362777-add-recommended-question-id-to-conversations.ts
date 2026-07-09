import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableForeignKey,
} from 'typeorm';

export class AddRecommendedQuestionIdToConversations1783343362777 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'conversations',
      new TableColumn({
        name: 'recommended_question_id',
        type: 'uuid',
        isNullable: true,
      }),
    );
    await queryRunner.createForeignKey(
      'conversations',
      new TableForeignKey({
        name: 'FK_conversations_recommended_question_id',
        columnNames: ['recommended_question_id'],
        referencedTableName: 'recommended_question_items',
        referencedColumnNames: ['id'],
      }),
    );
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
