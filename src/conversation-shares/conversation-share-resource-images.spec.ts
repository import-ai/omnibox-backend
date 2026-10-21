import {
  publishConversationShareText,
  resourceImageReferences,
  sameResourceImage,
} from './conversation-share-resource-images';

describe('conversation share resource images', () => {
  const image = {
    resourceId: 'res-1',
    attachmentId: 'pic-1',
    name: 'pic.png',
  };

  it('reads resource images from the current namespace only', () => {
    const content = [
      '![图](</api/v1/namespaces/ns-1/resources/res-1/attachments/pic-1>)',
      '![外](https://files.example/api/v1/namespaces/ns-1/resources/res-2/attachments/pic-2)',
      '![别人](/api/v1/namespaces/other/resources/res-1/attachments/pic-1)',
      '文档里的 attachments/pic-1 不公开',
    ].join('\n');

    expect(resourceImageReferences('ns-1', content)).toEqual([
      { resourceId: 'res-1', attachmentId: 'pic-1' },
      { resourceId: 'res-2', attachmentId: 'pic-2' },
    ]);
  });

  it('matches an exact id or a single extension on the stem', () => {
    const stored = {
      resourceId: 'res-1',
      attachmentId: 'a.png',
      name: 'a.png',
    };

    expect(sameResourceImage(stored, 'res-1', 'a.png')).toBe(true);
    expect(sameResourceImage(stored, 'res-1', 'a')).toBe(true);
    expect(sameResourceImage(stored, 'res-1', 'a.p')).toBe(false);
    expect(sameResourceImage(stored, 'res-2', 'a')).toBe(false);
  });

  it('publishes approved images and drops the rest', () => {
    const content =
      '看 ![图](</api/v1/namespaces/ns-1/resources/res-1/attachments/pic-1>) 和 ![隐藏](/api/v1/namespaces/ns-1/resources/res-9/attachments/secret)';

    expect(publishConversationShareText(content, 'share-1', [image])).toBe(
      '看 ![图](</api/v1/conversation-shares/share-1/resource-images/pic-1>) 和 ![隐藏]()',
    );
  });
});
