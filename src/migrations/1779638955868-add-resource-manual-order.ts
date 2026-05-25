import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableIndex,
} from 'typeorm';

export class AddResourceManualOrder1779638955868 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'resources',
      new TableColumn({
        name: 'manual_order',
        type: 'bigint',
        isNullable: false,
        default: 0,
      }),
    );

    await queryRunner.query(`
      WITH ordered AS (
        SELECT id,
          ROW_NUMBER() OVER (
            PARTITION BY namespace_id, parent_id
            ORDER BY updated_at DESC, id ASC
          ) - 1 AS position
        FROM resources
      )
      UPDATE resources r
      SET manual_order = ordered.position
      FROM ordered
      WHERE r.id = ordered.id
    `);

    await queryRunner.createIndex(
      'resources',
      new TableIndex({
        name: 'idx_resources_manual_order',
        columnNames: ['namespace_id', 'parent_id', 'manual_order'],
      }),
    );
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
