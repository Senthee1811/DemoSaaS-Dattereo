import { Injectable, NestMiddleware, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RedisService } from '@/modules/redis/redis.service';

/**
 * Rate limiting middleware for the gateway endpoint.
 * Uses a fixed-window approach with Redis counters.
 * Defaults to 60 requests per minute per IP if Redis is available.
 * Falls back to in-memory rate limiting if Redis is unavailable.
 */
@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RateLimitMiddleware.name);
  private readonly windowMs = 60_000; // 1 minute
  private readonly maxRequests = 60;  // 60 requests per minute per IP
  private readonly memoryStore = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly redisService: RedisService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
    const key = `ratelimit:gateway:${clientIp}`;

    try {
      const client = this.redisService.getClient();
      if (client) {
        const current = await client.incr(key);
        if (current === 1) {
          await client.expire(key, Math.ceil(this.windowMs / 1000));
        }

        const ttl = await client.ttl(key);
        res.setHeader('X-RateLimit-Limit', this.maxRequests);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, this.maxRequests - current));
        res.setHeader('X-RateLimit-Reset', Math.ceil(Date.now() / 1000) + ttl);

        if (current > this.maxRequests) {
          throw new HttpException(
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
      } else {
        // In-memory fallback
        this.checkMemoryRateLimit(clientIp, res);
      }
    } catch (err) {
      if (err instanceof HttpException) throw err;
      // If Redis errors out, fall back to memory-based limiting
      this.checkMemoryRateLimit(clientIp, res);
    }

    next();
  }

  private checkMemoryRateLimit(clientIp: string, res: Response) {
    const now = Date.now();
    const entry = this.memoryStore.get(clientIp);

    if (!entry || now > entry.resetAt) {
      this.memoryStore.set(clientIp, { count: 1, resetAt: now + this.windowMs });
      res.setHeader('X-RateLimit-Limit', this.maxRequests);
      res.setHeader('X-RateLimit-Remaining', this.maxRequests - 1);
      return;
    }

    entry.count++;
    res.setHeader('X-RateLimit-Limit', this.maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, this.maxRequests - entry.count));

    if (entry.count > this.maxRequests) {
      throw new HttpException(
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
  }
}
