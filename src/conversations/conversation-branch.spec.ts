import { MessageStatus } from 'omniboxd/messages/entities/message.entity';

import {
  BranchNode,
  branchRelations,
  branchTurns,
  conversationBranch,
  shareableAnswerIds,
} from './conversation-branch';

const node = (
  id: string,
  parent_id: string | null,
  role: string,
  extra: Partial<BranchNode> = {},
): BranchNode => ({
  id,
  parent_id,
  role,
  status: MessageStatus.SUCCESS,
  has_content: true,
  has_tool_calls: false,
  is_decision: false,
  ...extra,
});

describe('conversation history branches', () => {
  const nodes = [
    node('q1', null, 'user'),
    node('tool-call', 'q1', 'assistant', { has_tool_calls: true }),
    node('approval', 'tool-call', 'user', { is_decision: true }),
    node('a1', 'approval', 'assistant'),
    node('q2', 'a1', 'user'),
    node('a2', 'q2', 'assistant'),
    node('retry', 'q2', 'assistant'),
  ];
  it('keeps approvals in the same turn and pins older branches', () => {
    expect(
      branchTurns(conversationBranch(nodes, 'a2')).map((turn) =>
        turn.map((item) => item.id),
      ),
    ).toEqual([
      ['q1', 'tool-call', 'approval', 'a1'],
      ['q2', 'a2'],
    ]);
    expect(shareableAnswerIds(conversationBranch(nodes, 'retry'))).toEqual([
      'a1',
      'retry',
    ]);
    expect(branchRelations(nodes).siblings(nodes[5])).toEqual(['a2', 'retry']);
  });
  it('rejects missing and cyclic ancestry', () => {
    expect(() => conversationBranch(nodes, 'missing')).toThrow();
    expect(() =>
      conversationBranch([node('a', 'b', 'user'), node('b', 'a', 'assistant')]),
    ).toThrow();
    expect(branchTurns(conversationBranch([]))).toEqual([]);
  });
});
