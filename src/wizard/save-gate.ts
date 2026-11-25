/**
 * Pending-save gate shared by the backend core and backend-pro through Redis.
 *
 * The key is a hash of `token -> expires_at_ms`, so several saves can be
 * pending at once and each carries its own expiry; the hash disappears when
 * its last live token is removed. The key-level TTL is only a safety net.
 */
export const SAVE_GATE_PREFIX = 'wizard:save-gate:';
export const SAVE_GATE_SAFETY_TTL_SECONDS = 60 * 60;
// The bot refreshes its token every 60s while the save flow runs.
export const BOT_SAVE_GATE_TTL_MS = 180_000;
// Covers the append endpoint's own 290s wait under the shared deadline.
export const SAVE_ENDPOINT_GATE_TTL_MS = 360_000;

export function saveGateKey(scope: string): string {
  return SAVE_GATE_PREFIX + scope;
}

// Idempotent for a repeated token, which is what the heartbeat relies on.
export const BEGIN_PENDING_SAVE = `
local now = tonumber(ARGV[2])
for _, token in ipairs(redis.call('HKEYS', KEYS[1])) do
  local expires = tonumber(redis.call('HGET', KEYS[1], token))
  if not expires or expires <= now then redis.call('HDEL', KEYS[1], token) end
end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])
redis.call('EXPIRE', KEYS[1], ARGV[4])
return 1`;

export const END_PENDING_SAVE = `return redis.call('HDEL', KEYS[1], ARGV[1])`;

export const IS_SAVE_PENDING = `
local now = tonumber(ARGV[1])
for _, token in ipairs(redis.call('HKEYS', KEYS[1])) do
  local expires = tonumber(redis.call('HGET', KEYS[1], token))
  if expires and expires > now then return 1 end
end
return 0`;
