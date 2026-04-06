import { SpaceType } from 'omniboxd/namespace-resources/dto/resource.dto';

export class ParsedPathDo {
  /** team or private */
  spaceType?: SpaceType;

  /** Resource names like ['foo', 'bar'] */
  resourceNames?: string[];

  /** True if attachments */
  isAttachments?: boolean;

  /** Attachment name */
  attachmentName?: string;

  path: string;

  static fromPath(path: string): ParsedPathDo {
    if (!path.startsWith('/')) {
      throw new Error('Path must start with /');
    }

    const parts = path.split('/').filter((part) => part !== '');
    const result = new ParsedPathDo();
    result.path = '/' + parts.join('/');

    if (parts.length === 0) {
      return result;
    }

    const spaceType = parts[0] as SpaceType;
    if (spaceType !== SpaceType.TEAM && spaceType !== SpaceType.PRIVATE) {
      throw new Error(`Invalid space type: ${spaceType as string}`);
    }

    result.spaceType = spaceType;

    if (parts.length === 1) {
      return result;
    }

    const attachmentsIndex = parts.indexOf('attachments');
    if (attachmentsIndex !== -1) {
      if (attachmentsIndex < 2) {
        throw new Error('Invalid path');
      }

      result.resourceNames = parts.slice(1, attachmentsIndex);
      result.isAttachments = true;

      if (attachmentsIndex === parts.length - 1) {
        return result; // attachments is the last element
      }

      if (attachmentsIndex === parts.length - 2) {
        // There's an attachment name after attachments
        result.attachmentName = parts[attachmentsIndex + 1];
        return result;
      }
    }

    result.resourceNames = parts.slice(1);
    return result;
  }
}
