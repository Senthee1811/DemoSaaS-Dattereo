import { Injectable, NestMiddleware, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RedisService } from '@/modules/redis/redis.service';

/** Per-IP requests/minute for gateway calls that carry credentials. Abuse ceiling only. */
export function gatewayIpRpm(): number {
  const v = Number(process.env.GATEWAY_IP_RPM);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 6000;
}

/** Per-IP requests/minute for gateway calls with no credentials at all (scanners, misconfigured clients). */
export function gatewayUnauthIpRpm(): number {
  const v = Number(process.env.GATEWAY_UNAUTH_IP_RPM);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 60;
}

function hasCredentials(req: Request): boolean {
  const auth = req.headers.authorization;
  const sgKey = req.headers['x-spendguard-key'];
  return (typeof auth === 'string' && /^Bearer\s+\S+/.test(auth)) || (typeof sgKey === 'string' && sgKey.trim() !== '');
}

/**
 * Per-IP rate limiting for the gateway endpoint (fixed one-minute window, Redis,
 * in-memory fallback).
 *
 * This is abuse protection, NOT the product limit: server-side apps send all of
 * their traffic from one IP, so the real limits are per key (RPM/TPM, enforced in
 * the gateway). Credentialed traffic gets a high ceiling (GATEWAY_IP_RPM, default
 * 6000/min) so it never undercuts a key's configured RPM. Requests that carry no
 * credentials at all get a tight limit (GATEWAY_UNAUTH_IP_RPM, default 60/min).
 */
@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RateLimitMiddleware.name);
  private readonly windowMs = 60_000; // 1 minute
  private readonly memoryStore = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly redisService: RedisService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // req.ip only honours X-Forwarded-For when TRUST_PROXY is configured (see main.ts),
    // so clients cannot rotate a spoofed header to escape the limit.
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const credentialed = hasCredentials(req);
    const maxRequests = credentialed ? gatewayIpRpm() : gatewayUnauthIpRpm();
    const key = credentialed ? `ratelimit:gateway:${clientIp}` : `ratelimit:gateway-anon:${clientIp}`;

    try {
      const client = this.redisService.getClient();
      if (client) {
        const current = await client.incr(key);
        if (current === 1) {
          await client.expire(key, Math.ceil(this.windowMs / 1000));
        }

        const ttl = await client.ttl(key);
        res.setHeader('X-RateLimit-Limit', maxRequests);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - current));
        res.setHeader('X-RateLimit-Reset', Math.ceil(Date.now() / 1000) + ttl);

        if (current > maxRequests) {
          throw this.limitError();
        }
      } else {
        // In-memory fallback
        this.checkMemoryRateLimit(key, maxRequests, res);
      }
    } catch (err) {
      if (err instanceof HttpException) throw err;
      // If Redis errors out, fall back to memory-based limiting
      this.checkMemoryRateLimit(key, maxRequests, res);
    }

    next();
  }

  private limitError(): HttpException {
    return new HttpException(
      {
        error: {
          message: 'Rate limit exceeded. Please try again later.',
          type: 'rate_limit_error',
          code: 'rate_limit_exceeded',
        },
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private checkMemoryRateLimit(key: string, maxRequests: number, res: Response) {
    const now = Date.now();
    if (this.memoryStore.size > 10_000) {
      for (const [k, e] of this.memoryStore) {
        if (now > e.resetAt) this.memoryStore.delete(k);
      }
    }
    const entry = this.memoryStore.get(key);

    if (!entry || now > entry.resetAt) {
      this.memoryStore.set(key, { count: 1, resetAt: now + this.windowMs });
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', maxRequests - 1);
      return;
    }

    entry.count++;
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - entry.count));

    if (entry.count > maxRequests) {
      throw this.limitError();
    }
  }
}
