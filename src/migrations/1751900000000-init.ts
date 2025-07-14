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
        default: "''",
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
        default: "''",
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

async function createGroupsTable(queryRunner: QueryRunner): Promise<void> {
  const table = new Table({
    name: 'groups',
    columns: [
      {
        name: 'id',
        type: 'character varying',
        isPrimary: true,
      },
      {
        name: 'namespace_id',
        type: 'character varying',
        isNullable: false,
      },
      {
        name: 'title',
        type: 'character varying',
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
    ],
  });
  await queryRunner.createTable(table, true, true, true);
}

async function createGroupUsersTable(queryRunner: QueryRunner): Promise<void> {
  const table = new Table({
    name: 'group_users',
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
        name: 'group_id',
        type: 'character varying',
        isNullable: false,
      },
      {
        name: 'user_id',
        type: 'uuid',
        isNullable: false,
      },
      ...BaseColumns(),
    ],
    indices: [
      {
        columnNames: ['namespace_id', 'group_id', 'user_id'],
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
        columnNames: ['group_id'],
        referencedTableName: 'groups',
        referencedColumnNames: ['id'],
      },
      {
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
      },
    ],
  });
  await queryRunner.createTable(table, true, true, true);
}

async function createNamespaceRoleEnum(
  queryRunner: QueryRunner,
): Promise<void> {
  await queryRunner.query(`
    CREATE TYPE namespace_role AS ENUM (
      'owner',
      'member'
    )
  `);
}

async function createNamespaceMembersTable(
  queryRunner: QueryRunner,
): Promise<void> {
  const table = new Table({
    name: 'namespace_members',
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
        name: 'role',
        type: 'namespace_role',
        isNullable: false,
      },
      {
        name: 'root_resource_id',
        type: 'character varying',
        isNullable: false,
      },
      ...BaseColumns(),
    ],
    indices: [
      {
        columnNames: ['user_id', 'namespace_id'],
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
        columnNames: ['root_resource_id'],
        referencedTableName: 'resources',
        referencedColumnNames: ['id'],
      },
    ],
  });
  await queryRunner.createTable(table, true, true, true);
}

async function createGroupPermissionsTable(
  queryRunner: QueryRunner,
): Promise<void> {
  const table = new Table({
    name: 'group_permissions',
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
        name: 'group_id',
        type: 'character varying',
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
        columnNames: ['namespace_id', 'resource_id', 'group_id'],
        isUnique: true,
        where: 'deleted_at IS NULL',
      },
    ],
    foreignKeys: [
      {
        columnNames: ['group_id'],
        referencedTableName: 'groups',
        referencedColumnNames: ['id'],
      },
      {
        columnNames: ['resource_id'],
        referencedTableName: 'resources',
        referencedColumnNames: ['id'],
      },
      {
        columnNames: ['namespace_id'],
        referencedTableName: 'namespaces',
        referencedColumnNames: ['id'],
      },
    ],
  });
  await queryRunner.createTable(table, true, true, true);
}

async function createInvitationsTable(queryRunner: QueryRunner): Promise<void> {
  const table = new Table({
    name: 'invitations',
    columns: [
      {
        name: 'id',
        type: 'character varying',
        isPrimary: true,
      },
      {
        name: 'namespace_id',
        type: 'character varying',
        isNullable: false,
      },
      {
        name: 'namespace_role',
        type: 'namespace_role',
        isNullable: false,
      },
      {
        name: 'root_permission_level',
        type: 'permission_level',
        isNullable: false,
      },
      {
        name: 'group_id',
        type: 'character varying',
        isNullable: true,
      },
      ...BaseColumns(),
    ],
    indices: [
      {
        columnNames: ['namespace_id', 'group_id'],
        isUnique: true,
        where: 'deleted_at IS NULL',
      },
      {
        columnNames: ['namespace_id'],
        isUnique: true,
        where: 'deleted_at IS NULL AND group_id IS NULL',
      },
    ],
    foreignKeys: [
      {
        columnNames: ['group_id'],
        referencedTableName: 'groups',
        referencedColumnNames: ['id'],
      },
      {
        columnNames: ['namespace_id'],
        referencedTableName: 'namespaces',
        referencedColumnNames: ['id'],
      },
    ],
  });
  await queryRunner.createTable(table, true, true, true);
}

async function createTasksTable(queryRunner: QueryRunner): Promise<void> {
  const table = new Table({
    name: 'tasks',
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
        name: 'user_id',
        type: 'uuid',
        isNullable: false,
      },
      {
        name: 'priority',
        type: 'bigint',
        isNullable: false,
        default: 5,
      },
      {
        name: 'function',
        type: 'character varying',
        isNullable: false,
      },
      {
        name: 'input',
        type: 'jsonb',
        isNullable: false,
      },
      {
        name: 'payload',
        type: 'jsonb',
        isNullable: true,
      },
      {
        name: 'output',
        type: 'jsonb',
        isNullable: true,
      },
      {
        name: 'exception',
        type: 'jsonb',
        isNullable: true,
      },
      {
        name: 'started_at',
        type: 'timestamp with time zone',
        isNullable: true,
      },
      {
        name: 'ended_at',
        type: 'timestamp with time zone',
        isNullable: true,
      },
      {
        name: 'canceled_at',
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
  });
  await queryRunner.createTable(table, true, true, true);
}

async function createConversationsTable(
  queryRunner: QueryRunner,
): Promise<void> {
  const table = new Table({
    name: 'conversations',
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
        name: 'user_id',
        type: 'uuid',
        isNullable: false,
      },
      {
        name: 'title',
        type: 'character varying',
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
    ],
  });
  await queryRunner.createTable(table, true, true, true);
}

async function createMessagesStatusEnum(
  queryRunner: QueryRunner,
): Promise<void> {
  await queryRunner.query(`
    CREATE TYPE messages_status AS ENUM (
      'pending',
      'streaming',
      'success',
      'stopped',
      'interrupted',
      'failed'
    )
  `);
}

async function createMessagesTable(queryRunner: QueryRunner): Promise<void> {
  const table = new Table({
    name: 'messages',
    columns: [
      {
        name: 'id',
        type: 'uuid',
        isPrimary: true,
        default: 'uuid_generate_v4()',
      },
      {
        name: 'user_id',
        type: 'uuid',
        isNullable: false,
      },
      {
        name: 'conversation_id',
        type: 'uuid',
        isNullable: false,
      },
      {
        name: 'parent_id',
        type: 'uuid',
        isNullable: true,
      },
      {
        name: 'status',
        type: 'messages_status',
        isNullable: false,
        default: "'pending'",
      },
      {
        name: 'message',
        type: 'jsonb',
        isNullable: false,
      },
      {
        name: 'attrs',
        type: 'jsonb',
        isNullable: true,
      },
      ...BaseColumns(),
    ],
    foreignKeys: [
      {
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
      },
      {
        columnNames: ['conversation_id'],
        referencedTableName: 'conversations',
        referencedColumnNames: ['id'],
      },
      {
        columnNames: ['parent_id'],
        referencedTableName: 'messages',
        referencedColumnNames: ['id'],
      },
    ],
  });
  await queryRunner.createTable(table, true, true, true);
}

export class Init1751900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await createNamespaceRoleEnum(queryRunner);
    await createPermissionLevelEnum(queryRunner);
    await createResourceTypeEnum(queryRunner);
    await createMessagesStatusEnum(queryRunner);

    await createUsersTable(queryRunner);
    await createNamespacesTable(queryRunner);
    await createResourcesTable(queryRunner);
    await createNamespaceMembersTable(queryRunner);

    await createGroupsTable(queryRunner);
    await createGroupUsersTable(queryRunner);

    await createUserPermissionsTable(queryRunner);
    await createGroupPermissionsTable(queryRunner);
    await createInvitationsTable(queryRunner);

    await createTasksTable(queryRunner);
    await createConversationsTable(queryRunner);
    await createMessagesTable(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    throw new Error('Not supported.');
  }
}
