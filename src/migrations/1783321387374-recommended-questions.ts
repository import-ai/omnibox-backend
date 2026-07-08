import { MigrationInterface, QueryRunner, Table } from 'typeorm';

import { BaseColumns } from './base-columns';

export class RecommendedQuestions1783321387374 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = new Table({
      name: 'recommended_questions',
      columns: [
        {
          name: 'id',
          type: 'bigserial',
          isPrimary: true,
        },
        {
          name: 'namespace_id',
          type: 'character varying',
          isNullable: false,
        },
        {
          name: 'user_id',
          type: 'uuid',
          isNullable: false,
        },
        {
          name: 'scanned_at',
          type: 'timestamp with time zone',
          isNullable: false,
        },
        {
          name: 'generated_at',
          type: 'timestamp with time zone',
          isNullable: true,
        },
        ...BaseColumns(),
      ],
      foreignKeys: [
        {
          columnNames: ['namespace_id'],
          referencedTableName: 'namespaces',
          referencedColumnNames: ['id'],
        },
        {
          columnNames: ['user_id'],
          referencedTableName: 'users',
          referencedColumnNames: ['id'],
        },
      ],
      indices: [
        {
          name: 'UQ_recommended_questions_namespace_user',
          columnNames: ['namespace_id', 'user_id'],
          isUnique: true,
          where: '"deleted_at" IS NULL',
        },
      ],
    });
    await queryRunner.createTable(table, true, true, true);

    const itemTable = new Table({
      name: 'recommended_question_items',
      columns: [
        {
          name: 'id',
          type: 'bigserial',
          isPrimary: true,
        },
        {
          name: 'recommended_question_id',
          type: 'bigint',
          isNullable: false,
        },
        {
          name: 'question',
          type: 'text',
          isNullable: false,
        },
        {
          name: 'meta',
          type: 'jsonb',
          isNullable: true,
        },
        ...BaseColumns(),
      ],
      foreignKeys: [
        {
          columnNames: ['recommended_question_id'],
          referencedTableName: 'recommended_questions',
          referencedColumnNames: ['id'],
        },
      ],
      indices: [
        {
          name: 'idx_recommended_question_items_question_id',
          columnNames: ['recommended_question_id'],
        },
      ],
    });
    await queryRunner.createTable(itemTable, true, true, true);
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
