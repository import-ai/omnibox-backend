import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddInitialSyncedAtToRssLinks1788255535304 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'rss_links',
      new TableColumn({
        name: 'initial_synced_at',
        type: 'timestamp with time zone',
        isNullable: true,
      }),
    );
    // Recent links may still overlap an old-version poll during a rolling deploy.
    // Leave them pending until a new-version poll explicitly marks them.
    await queryRunner.query(
      `UPDATE rss_links link
          SET initial_synced_at = completed.completed_at
         FROM (
           SELECT candidate.id AS link_id, MAX(poll.updated_at) AS completed_at
             FROM rss_links candidate
             JOIN rss_polls poll
               ON poll.url = candidate.url
              AND poll.status = 'succeed'
              AND (poll.created_at >= candidate.created_at
                OR poll.updated_at >= candidate.created_at)
              AND poll.deleted_at IS NULL
            WHERE candidate.deleted_at IS NULL
              AND candidate.created_at < NOW() - interval '10 minutes'
            GROUP BY candidate.id
         ) completed
        WHERE link.id = completed.link_id`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('rss_links', 'initial_synced_at');
  }
}
