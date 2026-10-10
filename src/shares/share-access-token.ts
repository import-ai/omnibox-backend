import { createHmac, timingSafeEqual } from 'node:crypto';

// A share-access token proves that a visitor already passed the share's own
// checks (password, login) before an internal call is made on their behalf.
// It is an HMAC over the share id and an expiry, so it can only be minted by
// a backend holding the secret and only opens the one share it names.
export const SHARE_ACCESS_HEADER = 'x-share-access';
export const SHARE_ACCESS_TTL_SECONDS = 60 * 60;

const KEY_SUFFIX = ':share-access';

interface ShareAccessPayload {
  share_id: string;
  exp: number;
}

function sign(secret: string, payload: string): string {
  return createHmac('sha256', secret + KEY_SUFFIX)
    .update(payload)
    .digest('base64url');
}

export function mintShareAccessToken(
  secret: string,
  shareId: string,
  ttlSeconds: number = SHARE_ACCESS_TTL_SECONDS,
  now: number = Date.now(),
): string {
  const payload: ShareAccessPayload = {
    share_id: shareId,
    exp: Math.floor(now / 1000) + ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${sign(secret, encoded)}`;
}

export function verifyShareAccessToken(
  secret: string,
  token: string | undefined,
  shareId: string,
  now: number = Date.now(),
): boolean {
  if (!token) {
    return false;
  }
  const [encoded, signature, ...rest] = token.split('.');
  if (!encoded || !signature || rest.length > 0) {
    return false;
  }
  const expected = Buffer.from(sign(secret, encoded));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return false;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return false;
  }
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }
  const { share_id, exp } = payload as Partial<ShareAccessPayload>;
  return (
    share_id === shareId &&
    typeof exp === 'number' &&
    exp > Math.floor(now / 1000)
  );
}
