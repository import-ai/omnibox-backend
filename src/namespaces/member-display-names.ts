import { NotFoundException } from '@nestjs/common';
import { mentionDisplayName } from 'omniboxd/resource-comments/mention-labels';
import { User } from 'omniboxd/user/entities/user.entity';
import { EntityManager, IsNull } from 'typeorm';

import { NamespaceMember } from './entities/namespace-member.entity';

type MemberIdentityRow = {
  id: string;
  userId: string;
  nickname: string | null;
  username: string | null;
  deletedAt: Date | null;
  userDeletedAt: Date | null;
  displayNameSnapshot: string | null;
};

export function memberDisplayNamesFromRows(rows: MemberIdentityRow[]) {
  const selected = new Map<string, MemberIdentityRow>();
  for (const row of rows) {
    const previous = selected.get(row.userId);
    if (
      !previous ||
      (previous.deletedAt && !row.deletedAt) ||
      (previous.deletedAt &&
        row.deletedAt &&
        (new Date(row.deletedAt).getTime() >
          new Date(previous.deletedAt).getTime() ||
          (new Date(row.deletedAt).getTime() ===
            new Date(previous.deletedAt).getTime() &&
            Number(row.id) > Number(previous.id))))
    ) {
      selected.set(row.userId, row);
    }
  }
  const names: Record<string, string> = {};
  for (const row of selected.values()) {
    const name =
      !row.deletedAt && !row.userDeletedAt && row.username
        ? mentionDisplayName(row)
        : row.displayNameSnapshot || row.nickname?.trim();
    if (name) names[row.userId] = name;
  }
  return names;
}

// Call only after authorizing the resource. The query is limited to referenced ids.
export async function resolveMemberDisplayNames(
  manager: EntityManager,
  namespaceId: string,
  userIds: string[],
): Promise<Record<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return {};
  const rows = await manager
    .getRepository(NamespaceMember)
    .createQueryBuilder('member')
    .withDeleted()
    .leftJoin(User, 'identity', 'identity.id = member.user_id')
    .select('member.id', 'id')
    .addSelect('member.user_id', 'userId')
    .addSelect('member.nickname', 'nickname')
    .addSelect('member.deleted_at', 'deletedAt')
    .addSelect('member.display_name_snapshot', 'displayNameSnapshot')
    .addSelect('identity.username', 'username')
    .addSelect('identity.deleted_at', 'userDeletedAt')
    .where('member.namespace_id = :namespaceId', { namespaceId })
    .andWhere('member.user_id IN (:...ids)', { ids })
    .getRawMany<MemberIdentityRow>();
  return memberDisplayNamesFromRows(rows);
}

// Identity writers always lock User before membership to serialize rename/leave/rejoin.
export async function lockMemberUser(manager: EntityManager, userId: string) {
  const user = await manager.findOne(User, {
    where: { id: userId },
    lock: { mode: 'pessimistic_write' },
  });
  if (!user) throw new NotFoundException();
  return user;
}

export async function freezeMemberDisplayNames(
  manager: EntityManager,
  userId: string,
  namespaceId?: string,
) {
  const user = await lockMemberUser(manager, userId);
  const members = await manager.find(NamespaceMember, {
    where: {
      userId,
      ...(namespaceId ? { namespaceId } : {}),
      deletedAt: IsNull(),
    },
    order: { id: 'ASC' },
    lock: { mode: 'pessimistic_write' },
  });
  for (const member of members) {
    await manager.update(
      NamespaceMember,
      { id: member.id, deletedAt: IsNull() },
      {
        displayNameSnapshot: mentionDisplayName({
          ...member,
          username: user.username,
        }),
      },
    );
  }
}
