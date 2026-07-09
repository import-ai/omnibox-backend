import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddClickedToRecommendedQuestionItems1783343362778 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'recommended_question_items',
      new TableColumn({
        name: 'clicked',
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
