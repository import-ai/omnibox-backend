import {
  MessageAttrs,
  OpenAIMessage,
} from 'omniboxd/messages/entities/message.entity';
import {
  attrsForVisitor,
  messageForVisitor,
} from 'omniboxd/shares/chat-only-payload';

function toolCall(args: string) {
  return {
    id: 'call-1',
    type: 'function',
    function: { name: 'read_resource', arguments: args },
  };
}

function argsOf(message: { tool_calls?: Record<string, any>[] }) {
  return JSON.parse(message.tool_calls![0].function.arguments as string);
}

describe('attrsForVisitor', () => {
  it('drops citations', () => {
    const attrs = attrsForVisitor({
      citations: [{ title: 'Secret roadmap', link: 'r-id' }],
      usage: { tokens: 12 },
    });

    expect(attrs?.citations).toBeUndefined();
    expect(attrs?.usage).toEqual({ tokens: 12 });
  });

  it('drops resource ids nested anywhere in tool-call state', () => {
    const attrs = attrsForVisitor({
      tool_call: {
        in_streaming: false,
        decisions: [
          { type: 'accept', args: { resource_id: 'r-id', title: 'Notes' } },
        ],
        operations: [
          { parent_id: 'p-id', new_parent_id: 'n-id', kind: 'move' },
        ],
      },
    });

    const serialized = JSON.stringify(attrs);
    expect(serialized).not.toContain('r-id');
    expect(serialized).not.toContain('p-id');
    expect(serialized).not.toContain('n-id');
    // Everything that does not name a resource survives.
    expect(serialized).toContain('Notes');
    expect(serialized).toContain('move');
    expect(attrs?.tool_call?.in_streaming).toBe(false);
  });

  it.each([undefined, null])('passes %s through', (value) => {
    const attrs = value as MessageAttrs | null | undefined;
    expect(attrsForVisitor(attrs)).toBe(attrs);
  });

  it('does not mutate the stored attrs', () => {
    const stored = { citations: [{ title: 'Secret roadmap' }] };

    attrsForVisitor(stored);

    expect(stored.citations).toHaveLength(1);
  });
});

describe('messageForVisitor', () => {
  it('drops resource id args while keeping the rest', () => {
    const message = messageForVisitor<Partial<OpenAIMessage>>({
      tool_calls: [
        toolCall(JSON.stringify({ resource_id: 'r-id', query: 'roadmap' })),
      ],
    });

    expect(argsOf(message)).toEqual({ query: 'roadmap' });
    expect(JSON.stringify(message)).not.toContain('r-id');
  });

  it('replaces unparseable args rather than passing them through', () => {
    const message = messageForVisitor<Partial<OpenAIMessage>>({
      tool_calls: [toolCall('{"resource_id": "r-id"')],
    });

    expect(message.tool_calls![0].function.arguments).toBe('{}');
  });

  it('leaves a message without tool calls untouched', () => {
    const message: Partial<OpenAIMessage> = { content: 'An answer.' };

    expect(messageForVisitor(message)).toBe(message);
  });

  it('does not mutate the stored message', () => {
    const stored: Partial<OpenAIMessage> = {
      tool_calls: [toolCall(JSON.stringify({ resource_id: 'r-id' }))],
    };

    messageForVisitor(stored);

    expect(stored.tool_calls![0].function.arguments).toContain('r-id');
  });
});
