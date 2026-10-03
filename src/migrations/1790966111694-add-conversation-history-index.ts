import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConversationHistoryIndex1790966111694 implements MigrationInterface {
  public readonly transaction = false;
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conversation_live ON messages (conversation_id, created_at, id) WHERE deleted_at IS NULL',
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX CONCURRENTLY IF EXISTS idx_messages_conversation_live',
    );
  }
}
