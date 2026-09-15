import { commentPng } from 'test/comment-image-fixture';

import { detectCommentImageType } from './comment-image';

describe('comment image signatures', () => {
  it('recognizes PNG, JPEG, GIF and WebP headers', () => {
    expect(detectCommentImageType(commentPng)).toBe('image/png');
    expect(
      detectCommentImageType(Buffer.from('ffd8ffe000104a464946', 'hex')),
    ).toBe('image/jpeg');
    expect(
      detectCommentImageType(Buffer.from('47494638396101000100800000', 'hex')),
    ).toBe('image/gif');
    expect(
      detectCommentImageType(
        Buffer.from('524946460c000000574542505650384c00000000', 'hex'),
      ),
    ).toBe('image/webp');
  });

  it.each([
    Buffer.alloc(0),
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    ),
    Buffer.from('<html><script>alert(1)</script></html>'),
    commentPng.subarray(0, 16),
  ])('rejects non-raster or truncated content %j', (bytes) => {
    expect(detectCommentImageType(bytes)).toBeNull();
  });
});
