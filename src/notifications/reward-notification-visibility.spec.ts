import { I18nService } from 'nestjs-i18n';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

import { Notification, NotificationRead } from './entities/notification.entity';
import { NotificationsService } from './notifications.service';

describe('Reward notification visibility query', () => {
  let source: DataSource;
  let service: NotificationsService;

  beforeAll(async () => {
    source = new DataSource({
      type: 'postgres',
      entities: [Notification, NotificationRead],
      namingStrategy: new SnakeNamingStrategy(),
    });
    await (
      source as unknown as { buildMetadatas(): Promise<void> }
    ).buildMetadatas();
    service = new NotificationsService(
      source.getRepository(Notification),
      source.getRepository(NotificationRead),
      {} as I18nService,
    );
  });

  it.each([undefined, 'notice-B'])(
    'keeps namespace restrictions while adding own rewards for scope %s',
    (namespaceId) => {
      const query = (
        service as unknown as {
          createVisibleQuery(
            userId: string,
            namespaceId?: string,
          ): ReturnType<typeof source.createQueryBuilder>;
        }
      ).createVisibleQuery('user-1', namespaceId);
      const sql = query.getSql();
      expect(sql).toContain(
        '"notification"."user_id" = $1 AND "notification"."namespace_id" IS NULL',
      );
      expect(sql).toMatch(
        /"notification"\."user_id" = \$1 AND \$\d+ = ANY\("notification"\."tags"\)/,
      );
      if (namespaceId) {
        expect(sql).toContain(
          '"notification"."user_id" = $1 AND "notification"."namespace_id" = $2',
        );
      }
      expect(query.getParameters()).toMatchObject({
        userId: 'user-1',
        rewardTag: 'activity_reward',
      });
    },
  );
});
