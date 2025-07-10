import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { BaseColumns } from './base-columns';

async function createUsersTable(queryRunner: QueryRunner): Promise<void> {
  const table = new Table({
    name: 'users',
    columns: [
      {
        name: 'id',
        type: 'uuid',
        isPrimary: true,
        isNullable: false,
        default: 'uuid_generate_v4()',
      },
      {
        name: 'username',
        type: 'character varying',
        isNullable: true,
      },
      {
        name: 'email',
        type: 'character varying',
        isNullable: false,
      },
      {
        name: 'password',
        type: 'character varying',
        isNullable: false,
      },
      ...BaseColumns(),
    ],
    indices: [
      {
        columnNames: ['username'],
        isUnique: true,
        where: 'deleted_at IS NULL',
      },
      {
        columnNames: ['email'],
        isUnique: true,
        where: 'deleted_at IS NULL',
      },
    ],
  });
  await queryRunner.createTable(table, true, true, true);
}

async function createNamespacesTable(queryRunner: QueryRunner): Promise<void> {
  const table = new Table({
    name: 'namespaces',
    columns: [
      {
        name: 'id',
        type: 'character varying',
        isPrimary: true,
        isNullable: false,
      },
      {
        name: 'name',
        type: 'character varying',
        isNullable: false,
      },
      {
        name: 'max_running_tasks',
        type: 'bigint',
        isNullable: false,
        default: '1',
      },
      {
        name: 'root_resource_id',
        type: 'character varying',
        isNullable: true,
      },
      ...BaseColumns(),
    ],
    indices: [
      {
        columnNames: ['name'],
        isUnique: true,
        where: 'deleted_at IS NULL',
      },
    ],
    // foreignKeys: [
    //   {
    //     columnNames: ['root_resource_id'],
    //     referencedTableName: 'resources',
    //     referencedColumnNames: ['id'],
    //   }
    // ]
  });
  await queryRunner.createTable(table, true, true, true);
}

async function createResourceTypeEnum(queryRunner: QueryRunner): Promise<void> {
  await queryRunner.query(`
    CREATE TYPE resource_type AS ENUM (
      'doc',
      'link',
      'file',
      'folder'
    )
  `);
}

async function createResourcesTable(queryRunner: QueryRunner): Promise<void> {
  const table = new Table({
    name: 'resources',
    columns: [
      {
        name: 'id',
        type: 'character varying',
        isPrimary: true,
        isNullable: false,
      },
      {
        name: 'namespace_id',
        type: 'character varying',
        isNullable: false,
      },
      {
        name: 'user_id',
        type: 'uuid',
        isNullable: true,
      },
      {
        name: 'parent_id',
        type: 'character varying',
        isNullable: true,
      },
      {
        name: 'name',
        type: 'character varying',
        isNullable: false,
        default: '',
      },
      {
        name: 'resource_type',
        type: 'resource_type',
        isNullable: false,
      },
      {
        name: 'content',
        type: 'text',
        isNullable: false,
        default: '',
      },
      {
        name: 'tags',
        type: 'jsonb',
        isNullable: false,
        default: "'[]'::jsonb",
      },
      {
        name: 'attrs',
        type: 'jsonb',
        isNullable: false,
        default: "'{}'::jsonb",
      },
      {
        name: 'global_level',
        type: 'permission_level',
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
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
      },
      {
        columnNames: ['parent_id'],
        referencedTableName: 'resources',
        referencedColumnNames: ['id'],
      },
    ],
  });
  await queryRunner.createTable(table, true, true, true);
}

async function createPermissionLevelEnum(
  queryRunner: QueryRunner,
): Promise<void> {
  await queryRunner.query(`
    CREATE TYPE permission_level AS ENUM (
      'no_access',
      'can_view',
      'can_comment',
      'can_edit',
      'full_access'
    )
  `);
}

async function createUserPermissionsTable(
  queryRunner: QueryRunner,
): Promise<void> {
  const table = new Table({
    name: 'user_permissions',
    columns: [
      {
        name: 'id',
        type: 'bigserial',
        isPrimary: true,
        isNullable: false,
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
        name: 'resource_id',
        type: 'character varying',
        isNullable: false,
      },
      {
        name: 'level',
        type: 'permission_level',
        isNullable: false,
      },
      ...BaseColumns(),
    ],
    indices: [
      {
        columnNames: ['namespace_id', 'resource_id', 'user_id'],
        isUnique: true,
        where: 'deleted_at IS NULL',
      },
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
      {
        columnNames: ['resource_id'],
        referencedTableName: 'resources',
        referencedColumnNames: ['id'],
      },
    ],
  });
  await queryRunner.createTable(table, true, true, true);
}

export class Init1751900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await createUsersTable(queryRunner);
    await createNamespacesTable(queryRunner);
    await createResourceTypeEnum(queryRunner);
    await createResourcesTable(queryRunner);
    await createPermissionLevelEnum(queryRunner);
    await createUserPermissionsTable(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    throw new Error('Not supported.');
  }
}
