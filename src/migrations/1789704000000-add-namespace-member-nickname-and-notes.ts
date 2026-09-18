import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableIndex,
} from 'typeorm';

import { BaseColumns } from './base-columns';

export class AddNamespaceMemberNicknameAndNotes1789704000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'namespace_members',
      new TableColumn({
        name: 'nickname',
        type: 'character varying',
        length: '64',
        isNullable: true,
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'namespace_member_notes',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'namespace_id',
            type: 'character varying',
            isNullable: false,
          },
          {
            name: 'author_user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'target_user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'note',
            type: 'character varying',
            length: '128',
            isNullable: false,
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
            columnNames: ['author_user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
          },
          {
            columnNames: ['target_user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
          },
        ],
      }),
      true,
      true,
      true,
    );

    await queryRunner.createIndex(
      'namespace_member_notes',
      new TableIndex({
        name: 'uq_namespace_member_notes_author_target',
        columnNames: ['namespace_id', 'author_user_id', 'target_user_id'],
        isUnique: true,
        where: 'deleted_at IS NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('namespace_member_notes', true, true, true);
    await queryRunner.dropColumn('namespace_members', 'nickname');
  }
}
