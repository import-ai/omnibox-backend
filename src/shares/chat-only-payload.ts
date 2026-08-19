import {
  MessageAttrs,
  OpenAIMessage,
} from 'omniboxd/messages/entities/message.entity';

// Mirrors the web's RESOURCE_ID_ARG_KEYS: the tool-call args it renders as
// resource chips. A chat-only share lends its resources to the assistant and
// names none of them to the visitor, so these never leave the server.
const RESOURCE_ID_ARG_KEYS = new Set([
  'resource_id',
  'parent_id',
  'new_parent_id',
]);

function stripResourceIds(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripResourceIds);
  }
  if (value && typeof value === 'object') {
    const stripped: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (RESOURCE_ID_ARG_KEYS.has(key)) {
        continue;
      }
      stripped[key] = stripResourceIds(entry);
    }
    return stripped;
  }
  return value;
}

function stripToolCall(toolCall: Record<string, any>): Record<string, any> {
  const args: unknown = toolCall?.function?.arguments;
  if (typeof args !== 'string') {
    return toolCall;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(args);
  } catch {
    // Unparseable args could still spell out an id, and the web parses this
    // string unguarded, so hand back an empty object rather than the original.
    return {
      ...toolCall,
      function: { ...toolCall.function, arguments: '{}' },
    };
  }
  return {
    ...toolCall,
    function: {
      ...toolCall.function,
      arguments: JSON.stringify(stripResourceIds(parsed)),
    },
  };
}

/**
 * The sender's own picks also name resources: each private_search tool carries
 * the resources it was scoped to, user_context lists what was selected, and the
 * composer keeps a rendered part per mention. A share switched to chat-only
 * must stop replaying those from its history.
 */
function attrsWithoutSenderResources(attrs: MessageAttrs): void {
  if (attrs.tools) {
    attrs.tools = attrs.tools.map((tool) => {
      if (!tool || typeof tool !== 'object' || !('resources' in tool)) {
        return tool;
      }
      const visitorTool = { ...tool };
      delete visitorTool.resources;
      return visitorTool;
    });
  }
  if (attrs.user_context?.selected_resources) {
    const visitorContext = { ...attrs.user_context };
    delete visitorContext.selected_resources;
    attrs.user_context = visitorContext;
  }
  if (Array.isArray(attrs.composer?.display_parts)) {
    attrs.composer = {
      ...attrs.composer,
      display_parts: attrs.composer.display_parts.filter(
        (part: Record<string, any>) => part?.type !== 'resource',
      ),
    };
  }
}

/** Drops citations and any resource id reachable through tool-call state. */
export function attrsForVisitor<T extends MessageAttrs | null | undefined>(
  attrs: T,
): T {
  if (!attrs) {
    return attrs;
  }
  const visitorAttrs: MessageAttrs = { ...attrs };
  delete visitorAttrs.citations;
  if (visitorAttrs.tool_call) {
    visitorAttrs.tool_call = stripResourceIds(visitorAttrs.tool_call) as Record<
      string,
      any
    >;
  }
  attrsWithoutSenderResources(visitorAttrs);
  return visitorAttrs as T;
}

/** Drops the resource ids the assistant passed to its tools. */
export function messageForVisitor<T extends Partial<OpenAIMessage>>(
  message: T,
): T {
  if (!message?.tool_calls?.length) {
    return message;
  }
  return { ...message, tool_calls: message.tool_calls.map(stripToolCall) };
}
