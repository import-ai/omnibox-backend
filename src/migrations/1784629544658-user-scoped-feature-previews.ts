import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

const oldIndexName = 'UQ_feature_previews_namespace_user_feature';
const newIndexName = 'UQ_feature_previews_user_feature';

export class UserScopedFeaturePreviews1784629544658 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH ranked AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY user_id, feature
            ORDER BY updated_at DESC, id DESC
          ) AS row_number
        FROM feature_previews
        WHERE deleted_at IS NULL
      )
      DELETE FROM feature_previews
      WHERE id IN (
        SELECT id FROM ranked WHERE row_number > 1
      )
    `);

    const table = await queryRunner.getTable('feature_previews');
    if (!table) {
      throw new Error('feature_previews table not found');
    }

    const oldIndex = table.indices.find((index) => index.name === oldIndexName);
    if (oldIndex) {
      await queryRunner.dropIndex(table, oldIndex);
    }

    const namespaceForeignKey = table.foreignKeys.find((foreignKey) =>
      foreignKey.columnNames.includes('namespace_id'),
    );
    if (namespaceForeignKey) {
      await queryRunner.dropForeignKey(table, namespaceForeignKey);
    }

    await queryRunner.dropColumn('feature_previews', 'namespace_id');
    await queryRunner.createIndex(
      'feature_previews',
      new TableIndex({
        name: newIndexName,
        columnNames: ['user_id', 'feature'],
        isUnique: true,
        where: '"deleted_at" IS NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('feature_previews', newIndexName);
    await queryRunner.addColumn(
      'feature_previews',
      new TableColumn({
        name: 'namespace_id',
        type: 'character varying',
        isNullable: true,
      }),
    );

    await queryRunner.query(`
      WITH memberships AS (
        SELECT
          feature_previews.id AS feature_preview_id,
          namespace_members.namespace_id,
          ROW_NUMBER() OVER (
            PARTITION BY feature_previews.id
            ORDER BY namespace_members.created_at, namespace_members.id
          ) AS row_number
        FROM feature_previews
        INNER JOIN namespace_members
          ON namespace_members.user_id = feature_previews.user_id
          AND namespace_members.deleted_at IS NULL
      )
      UPDATE feature_previews
      SET namespace_id = memberships.namespace_id
      FROM memberships
      WHERE feature_previews.id = memberships.feature_preview_id
        AND memberships.row_number = 1
    `);

    await queryRunner.query(`
      INSERT INTO feature_previews (
        namespace_id,
        user_id,
        feature,
        enabled,
        created_at,
        updated_at,
        deleted_at
      )
      SELECT
        namespace_members.namespace_id,
        feature_previews.user_id,
        feature_previews.feature,
        feature_previews.enabled,
        feature_previews.created_at,
        feature_previews.updated_at,
        feature_previews.deleted_at
      FROM feature_previews
      INNER JOIN namespace_members
        ON namespace_members.user_id = feature_previews.user_id
        AND namespace_members.deleted_at IS NULL
        AND namespace_members.namespace_id <> feature_previews.namespace_id
    `);

    await queryRunner.query(
      'DELETE FROM feature_previews WHERE namespace_id IS NULL',
    );
    await queryRunner.query(
      'ALTER TABLE feature_previews ALTER COLUMN namespace_id SET NOT NULL',
    );
    await queryRunner.createForeignKey(
      'feature_previews',
      new TableForeignKey({
        columnNames: ['namespace_id'],
        referencedTableName: 'namespaces',
        referencedColumnNames: ['id'],
      }),
    );
    await queryRunner.createIndex(
      'feature_previews',
      new TableIndex({
        name: oldIndexName,
        columnNames: ['namespace_id', 'user_id', 'feature'],
        isUnique: true,
        where: '"deleted_at" IS NULL',
      }),
    );
  }
}
