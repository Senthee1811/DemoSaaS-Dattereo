import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

/**
 * Generates a unique request ID for end-to-end tracing.
 * Attaches it to the request object and response headers.
 * Per Step 13: "Request-ID traceable structured logs end-to-end."
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const requestId = req.headers['x-request-id'] as string || `sg-${crypto.randomUUID()}`;
    (req as any).requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  }
}
