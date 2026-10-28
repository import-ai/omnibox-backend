export function contributorLabel(input: {
  nickname?: string | null;
  username?: string | null;
  email?: string | null;
  userId?: string | null;
}): string {
  const identity =
    input.username?.trim() || input.email?.trim() || input.userId || '';
  const nickname = input.nickname?.trim() || '';
  if (nickname && identity && nickname !== identity) {
    return `${nickname}（${identity}）`;
  }
  return nickname || identity;
}

export function contributorInitial(label: string): string {
  return Array.from(label)[0]?.toLocaleUpperCase() || '?';
}

export function contributorTone(userId: string): string {
  let hash = 0;
  for (const character of userId) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0;
  }
  return String(Math.abs(hash) % 4);
}

export function sameStringSet(
  next: string[] | undefined,
  current: string[],
): boolean {
  if (next === undefined) {
    return true;
  }
  if (next.length !== current.length) {
    return false;
  }
  const left = [...next].sort();
  const right = [...current].sort();
  return left.every((value, index) => value === right[index]);
}

export function historicalMemberDisplayName(
  memberships: Array<{
    deletedAt?: Date | null;
    displayNameSnapshot?: string | null;
  }>,
): string {
  const deleted = memberships
    .filter((membership) => membership.deletedAt)
    .sort(
      (left, right) =>
        new Date(right.deletedAt ?? 0).getTime() -
        new Date(left.deletedAt ?? 0).getTime(),
    );
  for (const membership of deleted) {
    const snapshot = membership.displayNameSnapshot?.trim();
    if (snapshot) {
      return snapshot;
    }
  }
  return '';
}

export function formerContributorLabel(input: {
  historicalName?: string | null;
  frozenLabel?: string | null;
  username?: string | null;
  email?: string | null;
  userId?: string | null;
}): string {
  return (
    input.historicalName?.trim() ||
    input.frozenLabel?.trim() ||
    contributorLabel({
      username: input.username,
      email: input.email,
      userId: input.userId,
    })
  );
}
