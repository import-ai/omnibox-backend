import { EntityManager } from 'typeorm';

export class Transaction {
  constructor(
    readonly entityManager: EntityManager,
    readonly afterCommitHooks: Array<() => Promise<void>>,
  ) {}
}

export async function transaction<T>(
  entityManager: EntityManager,
  f: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const afterCommitHooks: Array<() => Promise<void>> = [];
  const result = entityManager.transaction(async (entityManager) => {
    const tx = new Transaction(entityManager, afterCommitHooks);
    return await f(tx);
  });
  for (const cb of afterCommitHooks) {
    await cb();
  }
  return result;
}
