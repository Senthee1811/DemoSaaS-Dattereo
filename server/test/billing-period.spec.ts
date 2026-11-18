// Run every assertion as if the server were in Sri Lanka (UTC+05:30): the
// local calendar is already in December while UTC is still in November.
process.env.TZ = 'Asia/Colombo';

import { RedisService } from '../src/modules/redis/redis.service';

const LATE_NOV_UTC = new Date('2026-11-30T20:00:00Z'); // 2026-12-01 01:30 in Colombo

describe('6. UTC billing periods', () => {
  it('the process really is in a UTC+05:30 zone for this test', () => {
    expect(LATE_NOV_UTC.getDate()).toBe(1); // local day = Dec 1
  });

  it('month key helper is UTC: 2026-11-30T20:00Z → 2026-11', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { utcMonthKey, utcMonthStart, utcNextMonthStart } = require('../src/common/billing-period');
    expect(utcMonthKey(LATE_NOV_UTC)).toBe('2026-11');
    expect(utcMonthStart(LATE_NOV_UTC).toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(utcNextMonthStart(LATE_NOV_UTC).toISOString()).toBe('2026-12-01T00:00:00.000Z');
  });

  it('Redis spend/hold keys use the UTC month', () => {
    const redis = new RedisService({ get: () => undefined } as any);
    const bucket = redis.projectMonthBucket('p1', 10, LATE_NOV_UTC);
    expect(bucket.spendKey).toBe('spendguard:spend:p1:2026-11');
    expect(bucket.holdsKey).toBe('spendguard:holds:p1:2026-11');
    // TTL: 4 h until Dec 1 00:00 UTC + 1 day buffer
    expect(bucket.keyTtlSec).toBe(4 * 3600 + 86400);
  });

  it('ISO week key is UTC (Monday-start, ISO year)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { utcIsoWeekKey, utcIsoWeekStart } = require('../src/common/billing-period');
    // Sunday 2026-11-29 22:00 UTC is Monday in Colombo, but still ISO week 48 in UTC
    expect(utcIsoWeekKey(new Date('2026-11-29T22:00:00Z'))).toBe('2026-W48');
    expect(utcIsoWeekStart(new Date('2026-11-29T22:00:00Z')).toISOString()).toBe('2026-11-23T00:00:00.000Z');
    expect(utcIsoWeekKey(new Date('2026-11-30T00:00:00Z'))).toBe('2026-W49');
    // ISO year boundary: 2027-01-01 (Friday) belongs to 2026-W53
    expect(utcIsoWeekKey(new Date('2027-01-01T12:00:00Z'))).toBe('2026-W53');
  });
});
