import { getStreamKey } from 'omniboxd/wizard/stream-key';

describe('getStreamKey', () => {
  it('keys a signed-in stream on the user', () => {
    expect(getStreamKey('namespace-1', 'conversation-1', 'user-1')).toBe(
      'user:user-1:namespace-1:conversation-1',
    );
  });

  it('keys a share stream on the share, ignoring the empty user', () => {
    expect(getStreamKey('namespace-1', 'conversation-1', '', 'share-1')).toBe(
      'share:share-1:namespace-1:conversation-1',
    );
  });

  it('separates a share stream from a user stream on one conversation', () => {
    expect(getStreamKey('ns', 'conv', 'user-1')).not.toBe(
      getStreamKey('ns', 'conv', '', 'share-1'),
    );
  });
});
