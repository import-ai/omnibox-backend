import { ConversationShareResourceImage } from './entities/conversation-share-group.entity';

export type { ConversationShareResourceImage };

export interface ResourceImageReference {
  resourceId: string;
  attachmentId: string;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/;

function resourceAttachmentPattern() {
  return /(?:https?:\/\/[^/\s)]+)?\/api\/v1\/namespaces\/([A-Za-z0-9_-]+)\/resources\/([A-Za-z0-9_-]+)\/attachments\/([A-Za-z0-9][A-Za-z0-9._-]*)/g;
}

export function isSafeResourceImageId(value: string) {
  return SAFE_ID.test(value) && !value.includes('..');
}

/** Resource images cited in share text. Other namespaces and relative attachments are ignored. */
export function resourceImageReferences(
  namespaceId: string,
  content: string,
): ResourceImageReference[] {
  const found: ResourceImageReference[] = [];
  const seen = new Set<string>();
  for (const match of content.matchAll(resourceAttachmentPattern())) {
    const [, namespace, resourceId, attachmentId] = match;
    if (
      namespace !== namespaceId ||
      !isSafeResourceImageId(resourceId) ||
      !isSafeResourceImageId(attachmentId)
    ) {
      continue;
    }
    const key = `${resourceId}\0${attachmentId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ resourceId, attachmentId });
  }
  return found;
}

export function sameResourceImage(
  image: ConversationShareResourceImage,
  resourceId: string,
  attachmentId: string,
) {
  if (image.resourceId !== resourceId) return false;
  if (image.attachmentId === attachmentId) return true;
  if (attachmentId.includes('.')) return false;
  const extension = image.attachmentId.slice(attachmentId.length + 1);
  return (
    image.attachmentId.startsWith(`${attachmentId}.`) &&
    /^[A-Za-z0-9]+$/.test(extension)
  );
}

/** Rewrites approved resource images to this share and removes every other resource attachment URL. */
export function publishConversationShareText(
  content: string,
  shareId: string,
  images: readonly ConversationShareResourceImage[],
) {
  return content.replace(
    resourceAttachmentPattern(),
    (_match, _namespace: string, resourceId: string, attachmentId: string) => {
      const image = images.find((item) =>
        sameResourceImage(item, resourceId, attachmentId),
      );
      if (!image || !isSafeResourceImageId(image.attachmentId)) return '';
      return `/api/v1/conversation-shares/${encodeURIComponent(shareId)}/resource-images/${encodeURIComponent(image.attachmentId)}`;
    },
  );
}
