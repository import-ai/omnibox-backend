import {
  mintShareAccessToken,
  verifyShareAccessToken,
} from './share-access-token';

describe('share access token', () => {
  const secret = 'test-secret';

  it('opens the share it was minted for', () => {
    const token = mintShareAccessToken(secret, 'share00001');
    expect(verifyShareAccessToken(secret, token, 'share00001')).toBe(true);
  });

  it('does not open another share', () => {
    const token = mintShareAccessToken(secret, 'share00001');
    expect(verifyShareAccessToken(secret, token, 'share00002')).toBe(false);
  });

  it('expires', () => {
    const minted = Date.now();
    const token = mintShareAccessToken(secret, 'share00001', 60, minted);
    expect(
      verifyShareAccessToken(secret, token, 'share00001', minted + 59_000),
    ).toBe(true);
    expect(
      verifyShareAccessToken(secret, token, 'share00001', minted + 61_000),
    ).toBe(false);
  });

  it('rejects a tampered payload, a wrong secret and garbage', () => {
    const token = mintShareAccessToken(secret, 'share00001');
    const [, signature] = token.split('.');
    const forged = `${Buffer.from(
      JSON.stringify({ share_id: 'share00002', exp: 2_000_000_000 }),
    ).toString('base64url')}.${signature}`;
    expect(verifyShareAccessToken(secret, forged, 'share00002')).toBe(false);
    expect(verifyShareAccessToken('other-secret', token, 'share00001')).toBe(
      false,
    );
    expect(verifyShareAccessToken(secret, 'not-a-token', 'share00001')).toBe(
      false,
    );
    expect(verifyShareAccessToken(secret, undefined, 'share00001')).toBe(false);
  });
});
