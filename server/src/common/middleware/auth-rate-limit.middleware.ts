import { Injectable, NestMiddleware, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RedisService } from '@/modules/redis/redis.service';

/** Per-IP attempts per minute on each auth route (login, register, forgot/reset password). */
export function authIpRpm(): number {
  const v = Number(process.env.AUTH_IP_RPM);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 10;
}

/** Per-email attempts per minute on login, register and forgot-password. */
export function authEmailRpm(): number {
  const v = Number(process.env.AUTH_EMAIL_RPM);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 5;
}

/** Routes whose body carries the account email (reset-password carries a token instead). */
const EMAIL_LIMITED = new Set(['login', 'register', 'forgot-password']);

/**
 * Brute-force protection for unauthenticated auth routes. Fixed one-minute
 * windows in Redis, per IP and (where the body names an account) per email.
 *
 * Fails OPEN when Redis is unavailable: unlike the gateway (which guards
 * money and fails closed), locking every user out of login during a Redis
 * outage would be worse than briefly losing brute-force protection.
 */
@Injectable()
export class AuthRateLimitMiddleware implements NestMiddleware {
  private readonly logger = new Logger(AuthRateLimitMiddleware.name);

  constructor(private readonly redisService: RedisService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const route = (req.originalUrl || req.path || '').split('?')[0].replace(/\/+$/, '').split('/').pop() || 'auth';
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const rawEmail = (req.body as any)?.email;
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';

    const client = this.redisService.getClient();
    if (!client) return next(); // fail open

    try {
      const window = Math.floor(Date.now() / 60000);
      const checks: [string, number][] = [[`ratelimit:auth:ip:${route}:${ip}:${window}`, authIpRpm()]];
      if (email && EMAIL_LIMITED.has(route)) {
        checks.push([`ratelimit:auth:email:${route}:${email}:${window}`, authEmailRpm()]);
      }

      const pipeline = client.multi();
      for (const [key] of checks) pipeline.incr(key).expire(key, 120);
      const results = (await pipeline.exec()) || [];

      for (let i = 0; i < checks.length; i++) {
        const count = Number(results[i * 2]?.[1] ?? 0);
        if (count > checks[i][1]) {
          const retryAfter = 60 - Math.floor((Date.now() % 60000) / 1000);
          res.setHeader('Retry-After', String(retryAfter));
          throw new HttpException(
            {
              error: {
                message: 'Too many attempts. Please wait a minute and try again.',
                type: 'rate_limit_error',
                code: 'auth_rate_limited',
              },
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }
    } catch (err) {
      if (err instanceof HttpException) throw err;
      // Redis error mid-check: fail open (never log the email)
      this.logger.warn(`Auth rate limit unavailable, allowing request: ${(err as Error).message}`);
    }

    next();
  }
}
