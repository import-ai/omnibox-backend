export type RequestActionType =
  | 'resource_add'
  | 'resource_edit'
  | 'ai_conversation'
  | 'annotation_comment'
  | 'document_comment';
/**
 * Matches only explicit product writes; background synchronization has no
 * registered starter. The route rules are mirrored in
 * omnibox-web/src/lib/behaviorRequest.ts and
 * omnibox-react-native/lib/behavior-request.ts; keep them in sync.
 */
export function behaviorRequestKind(
  method: string,
  url: string,
  body?: unknown,
): RequestActionType | undefined {
  const path = url
    .replace(/^https?:\/\/[^/]+/, '')
    .replace(/^\/api\/v1/, '')
    .split('?')[0];
  const data =
    body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const verb = method.toUpperCase();
  if (
    verb === 'POST' &&
    /^\/namespaces\/[^/]+\/wizard\/collect\/url$/.test(path)
  )
    return 'resource_add';
  if (
    verb === 'POST' &&
    /^\/namespaces\/[^/]+\/resources(?:\/batch-folder|\/files)?$/.test(path)
  )
    return 'resource_add';
  if (
    verb === 'POST' &&
    /^\/namespaces\/[^/]+\/(smart-folders|rss-folders)$/.test(path)
  )
    return 'resource_add';
  if (
    verb === 'PATCH' &&
    /^\/namespaces\/[^/]+\/resources\/[^/]+$/.test(path) &&
    ['name', 'content'].some((key) => key in data)
  )
    return 'resource_edit';
  if (
    verb === 'POST' &&
    (/\/wizard\/(ask|chat)$/.test(path) ||
      /^\/namespaces\/[^/]+\/wizard\/conversations\/[^/]+\/messages$/.test(
        path,
      ))
  )
    return 'ai_conversation';
  if (
    verb === 'POST' &&
    /^\/namespaces\/[^/]+\/resources\/[^/]+\/comment-threads$/.test(path)
  )
    return data.type === 'document' ? 'document_comment' : 'annotation_comment';
  if (
    verb === 'POST' &&
    /^\/namespaces\/[^/]+\/resources\/[^/]+\/comment-threads\/[^/]+\/comments$/.test(
      path,
    )
  )
    return 'annotation_comment';
  return undefined;
}
