import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddApiKeyValue1754577818000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if there are existing records
    const existingApiKeys = await queryRunner.query(
      'SELECT id FROM api_keys ORDER BY created_at',
    );

    if (existingApiKeys.length > 0) {
      // If there are existing records, add column as nullable first
      await queryRunner.addColumn(
        'api_keys',
        new TableColumn({
          name: 'value',
          type: 'character varying',
          isNullable: true,
        }),
      );

      // Update existing records with unique values
      for (let i = 0; i < existingApiKeys.length; i++) {
        const apiKey = existingApiKeys[i];
        // Generate a unique value for existing records
        const randomHex = Math.random()
          .toString(16)
          .substring(2, 42)
          .padEnd(40, '0');
        const value = `sk-${randomHex}`;

        await queryRunner.query(
          'UPDATE api_keys SET value = $1 WHERE id = $2',
          [value, apiKey.id],
        );
      }

      // Now make the column NOT NULL and add unique constraint
      await queryRunner.query(
        'ALTER TABLE api_keys ALTER COLUMN value SET NOT NULL',
      );
    } else {
      // If no existing records, add column as NOT NULL directly
      await queryRunner.addColumn(
        'api_keys',
        new TableColumn({
          name: 'value',
          type: 'character varying',
          isNullable: false,
        }),
      );
    }

    // Add unique constraint
    await queryRunner.query(
      'ALTER TABLE api_keys ADD CONSTRAINT UQ_api_keys_value UNIQUE (value)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE api_keys DROP CONSTRAINT UQ_api_keys_value',
    );
    await queryRunner.dropColumn('api_keys', 'value');
  }
}
