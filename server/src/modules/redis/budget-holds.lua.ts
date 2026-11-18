/**
 * Lua scripts for per-request budget holds. See RedisService.reserveHold.
 *
 * Bucket layout in KEYS (3 per bucket): spendKey, holdsKey (HASH id->amount),
 * holdsExpKey (ZSET id->expiry epoch ms). Time comes from the Redis server
 * clock (TIME) so every backend instance agrees on what has expired.
 */

/** A spend counter with its own cap that a request's hold must fit into. */
export interface BudgetBucket {
  /** Stable label used in error messages, e.g. 'project_monthly'. */
  name: string;
  spendKey: string;
  holdsKey: string;
  holdsExpKey: string;
  /** USD cap; null = tracked but uncapped. */
  cap: number | null;
  /** TTL applied to the bucket's keys (end of period + buffer). */
  keyTtlSec: number;
}

export interface HoldReservation {
  status: 'reserved' | 'rejected' | 'duplicate';
  /** The bucket that would have been exceeded (status 'rejected'). */
  failedBucket?: BudgetBucket;
  /** Settled spend of the failed bucket (rejected) or the first bucket. */
  spend: number;
  /** Active holds in that bucket (including this one when reserved). */
  held: number;
}

/** How long a finalized (settled/released) request ID is remembered for idempotency. */
export const FINALIZED_MARKER_TTL_SEC = 2 * 24 * 3600;

/**
 * Default hold lifetime: long enough to outlive any in-flight upstream call
 * (proxy timeout + 60 s margin, at least 5 min). Override with BUDGET_HOLD_TTL_MS.
 */
export function budgetHoldTtlMs(): number {
  const override = Number(process.env.BUDGET_HOLD_TTL_MS);
  if (Number.isFinite(override) && override > 0) return override;
  const proxyTimeout = Number(process.env.GATEWAY_PROXY_TIMEOUT_MS) || 60000;
  return Math.max(5 * 60 * 1000, proxyTimeout + 60000);
}

const NOW_MS = `
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
`;

const PRUNE_FN = `
local function prune(ak, ek, now)
  local expired = redis.call('ZRANGEBYSCORE', ek, '-inf', now)
  for _, rid in ipairs(expired) do redis.call('HDEL', ak, rid) end
  if #expired > 0 then redis.call('ZREMRANGEBYSCORE', ek, '-inf', now) end
end
`;

/**
 * ARGV: requestId, amount, holdTtlMs, then per bucket: cap (-1 = none), keyTtlSec
 * Returns {code, bucketIndex, spend, held}; code 1 = reserved, 0 = rejected, 2 = duplicate.
 */
export const RESERVE_HOLD_LUA = `
${NOW_MS}
${PRUNE_FN}
local id = ARGV[1]
local amount = tonumber(ARGV[2])
local holdTtl = tonumber(ARGV[3])
local n = #KEYS / 3
local firstSpend, firstHeld = 0, 0

for i = 1, n do
  local sk, ak, ek = KEYS[3*i-2], KEYS[3*i-1], KEYS[3*i]
  prune(ak, ek, now)
  if redis.call('HEXISTS', ak, id) == 1 then
    return {2, i, '0', '0'}
  end
  local held = 0
  for _, v in ipairs(redis.call('HVALS', ak)) do held = held + tonumber(v) end
  local spend = tonumber(redis.call('GET', sk) or '0')
  if i == 1 then firstSpend, firstHeld = spend, held end
  local cap = tonumber(ARGV[2 + 2*i])
  if cap >= 0 and (spend + held + amount) > cap then
    return {0, i, tostring(spend), tostring(held)}
  end
end

for i = 1, n do
  local ak, ek = KEYS[3*i-1], KEYS[3*i]
  local ttl = tonumber(ARGV[3 + 2*i])
  redis.call('HSET', ak, id, tostring(amount))
  redis.call('ZADD', ek, now + holdTtl, id)
  redis.call('EXPIRE', ak, ttl)
  redis.call('EXPIRE', ek, ttl)
end
return {1, 0, tostring(firstSpend), tostring(firstHeld + amount)}
`;

/**
 * KEYS: finalizedKey, then 3 per bucket. ARGV: requestId, actualCost, markerTtlSec, then keyTtlSec per bucket.
 * Returns {applied (1/0), spend of first bucket}.
 */
export const SETTLE_HOLD_LUA = `
local id = ARGV[1]
local actual = tonumber(ARGV[2])
local n = (#KEYS - 1) / 3
if not redis.call('SET', KEYS[1], 'settled', 'NX', 'EX', ARGV[3]) then
  return {0, redis.call('GET', KEYS[2]) or '0'}
end
local firstSpend = '0'
for i = 1, n do
  local sk, ak, ek = KEYS[3*i-1], KEYS[3*i], KEYS[3*i+1]
  redis.call('HDEL', ak, id)
  redis.call('ZREM', ek, id)
  local s = redis.call('INCRBYFLOAT', sk, actual)
  redis.call('EXPIRE', sk, tonumber(ARGV[3 + i]))
  if i == 1 then firstSpend = s end
end
return {1, firstSpend}
`;

/** KEYS: finalizedKey, then holdsKey/holdsExpKey per bucket. ARGV: requestId, markerTtlSec. */
export const RELEASE_HOLD_LUA = `
local id = ARGV[1]
if not redis.call('SET', KEYS[1], 'released', 'NX', 'EX', ARGV[2]) then
  return 0
end
for i = 2, #KEYS, 2 do
  redis.call('HDEL', KEYS[i], id)
  redis.call('ZREM', KEYS[i+1], id)
end
return 1
`;

/** KEYS: holdsKey, holdsExpKey. Returns the number of active holds left. */
export const PRUNE_HOLDS_LUA = `
${NOW_MS}
${PRUNE_FN}
prune(KEYS[1], KEYS[2], now)
return redis.call('HLEN', KEYS[1])
`;
