import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Raw token counts of the LLM call that produced a message, split the way
 * agent credits are priced. `attrs.usage` already carries the provider's last
 * usage block, but delta attrs are merged with an overwrite, so it holds one
 * call's numbers rather than the message's total. These columns accumulate.
 */
export class AddAgentTokenCountsToMessages1788782074419 implements MigrationInterface {
  private static readonly columns = [
    'input_token_uncached',
    'input_token_cached',
    'output_token',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns(
      'messages',
      AddAgentTokenCountsToMessages1788782074419.columns.map(
        (name) =>
          new TableColumn({
            name,
            type: 'bigint',
            isNullable: false,
            default: 0,
          }),
      ),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumns(
      'messages',
      AddAgentTokenCountsToMessages1788782074419.columns,
    );
  }
}
