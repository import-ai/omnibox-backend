export class ShareParsedPathDo {
  /** Resource names like ['foo', 'bar'] */
  resourceNames: string[];

  /** True if attachments */
  isAttachments?: boolean;

  /** Attachment name */
  attachmentName?: string;

  path: string;

  static fromPath(path: string): ShareParsedPathDo {
    if (!path.startsWith('/share')) {
      throw new Error('Path must start with /share');
    }

    const result = new ShareParsedPathDo();
    result.path = path;
    result.resourceNames = path
      .slice('/share'.length)
      .split('/')
      .filter((part) => part !== '');

    const idx = result.resourceNames.indexOf('attachments');
    if (idx !== -1) {
      result.isAttachments = true;
      if (idx + 1 < result.resourceNames.length) {
        result.attachmentName = result.resourceNames[idx + 1];
      }
      result.resourceNames = result.resourceNames.slice(0, idx);
    }

    if (result.resourceNames.length === 0) {
      throw new Error('Resource names cannot be empty');
    }
    return result;
  }
}
