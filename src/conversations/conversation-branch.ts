import { MessageStatus } from 'omniboxd/messages/entities/message.entity';

export interface BranchNode {
  id: string;
  parent_id: string | null;
  role: string;
  status: MessageStatus;
  has_content: boolean;
  has_tool_calls: boolean;
  is_decision: boolean;
}

export function isQuestion(node: BranchNode) {
  return node.role === 'user' && !node.is_decision;
}

export function isShareableAnswer(node: BranchNode) {
  return (
    node.role === 'assistant' &&
    node.has_content &&
    !node.has_tool_calls &&
    [MessageStatus.SUCCESS, MessageStatus.STOPPED].includes(node.status)
  );
}

/** Resolve only live, authorized nodes supplied by the caller. */
export function conversationBranch(nodes: BranchNode[], leafId?: string) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const result: BranchNode[] = [];
  const visited = new Set<string>();
  let id: string | null | undefined = leafId ?? nodes.at(-1)?.id;
  while (id) {
    const node = byId.get(id);
    if (!node || visited.has(id))
      throw new Error('Invalid conversation branch');
    visited.add(id);
    result.push(node);
    id = node.parent_id;
  }
  return result.reverse();
}

export function branchTurns(branch: BranchNode[]) {
  const turns: BranchNode[][] = [];
  for (const node of branch) {
    if (node.role === 'system') continue;
    if (isQuestion(node) || !turns.length) turns.push([]);
    turns[turns.length - 1].push(node);
  }
  return turns;
}

export function shareableAnswerIds(branch: BranchNode[]) {
  return branchTurns(branch).flatMap((turn) => {
    if (!isQuestion(turn[0]) || !turn[0].has_content) return [];
    const answer = turn.findLast(isShareableAnswer);
    return answer ? [answer.id] : [];
  });
}

export function branchRelations(nodes: BranchNode[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map<string | null, string[]>();
  for (const node of nodes) {
    const ids = children.get(node.parent_id) ?? [];
    ids.push(node.id);
    children.set(node.parent_id, ids);
  }
  function leaf(id: string) {
    const seen = new Set<string>();
    while (children.get(id)?.length) {
      if (seen.has(id)) throw new Error('Invalid conversation branch');
      seen.add(id);
      id = children.get(id)!.at(-1)!;
    }
    return id;
  }
  function siblings(node: BranchNode): string[] {
    if (node.role === 'user') return children.get(node.parent_id) ?? [node.id];
    if (node.has_tool_calls) return [node.id];
    let parent: BranchNode | undefined = node;
    const seen = new Set<string>();
    while (parent && parent.role !== 'user') {
      if (seen.has(parent.id)) return [node.id];
      seen.add(parent.id);
      parent = byId.get(parent.parent_id ?? '');
    }
    if (!parent) return [node.id];
    const pending = [...(children.get(parent.id) ?? [])].reverse();
    const result: string[] = [];
    seen.clear();
    while (pending.length) {
      const id = pending.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const item = byId.get(id)!;
      if (item.role === 'assistant' && !item.has_tool_calls) result.push(id);
      else pending.push(...[...(children.get(id) ?? [])].reverse());
    }
    return result;
  }
  return { children, leaf, siblings };
}
