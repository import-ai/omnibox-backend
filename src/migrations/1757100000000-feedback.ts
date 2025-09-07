import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { BaseColumns } from './base-columns';

async function createFeedbackTypeEnum(queryRunner: QueryRunner): Promise<void> {
  await queryRunner.query(`
    CREATE TYPE feedback_type_enum AS ENUM (
      'bug',
      'suggestion',
      'feature',
      'other'
    )
  `);
}

async function createFeedbackTable(queryRunner: QueryRunner): Promise<void> {
  const table = new Table({
    name: 'feedback',
    columns: [
      {
        name: 'id',
        type: 'bigserial',
        isPrimary: true,
      },
      {
        name: 'type',
        type: 'feedback_type_enum',
        isNullable: false,
      },
      {
        name: 'description',
        type: 'text',
        isNullable: false,
      },
      {
        name: 'image_url',
        type: 'character varying',
        isNullable: true,
      },
      {
        name: 'contact_info',
        type: 'character varying',
        isNullable: true,
      },
      {
        name: 'user_agent',
        type: 'text',
        isNullable: true,
      },
      {
        name: 'user_id',
        type: 'uuid',
        isNullable: true,
      },
      ...BaseColumns(),
    ],
    foreignKeys: [
      {
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      },
    ],
    indices: [
      {
        columnNames: ['type'],
      },
      {
        columnNames: ['user_id'],
      },
      {
        columnNames: ['created_at'],
      },
    ],
  });
  await queryRunner.createTable(table, true, true, true);
}

export class Feedback1757100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await createFeedbackTypeEnum(queryRunner);
    await createFeedbackTable(queryRunner);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/require-await
  public async down(_queryRunner: QueryRunner): Promise<void> {
    throw new Error('Not supported.');
  }
}
