/**
 * Identity of one chat stream. A user stream and a share-visitor stream on the
 * same conversation are distinct sessions, so the key carries the discriminator.
 *
 * Exported because agent-credit metering keys its reservations on the same
 * string: reserve (wizard URL provider) and settle (StreamService) must derive
 * byte-identical identifiers.
 */
export function getStreamKey(
  namespaceId: string,
  conversationId: string,
  userId: string,
  shareId = '',
): string {
  return `${shareId ? `share:${shareId}` : `user:${userId}`}:${namespaceId}:${conversationId}`;
}
