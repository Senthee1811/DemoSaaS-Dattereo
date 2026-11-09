import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Scrubs potential API keys and secrets from error messages.
 * Per Step 13: "Scrub API keys and other secrets from all log output."
 */
function scrubSecrets(text: string): string {
  if (typeof text !== 'string') return text;
  // Scrub patterns: sk-..., AIzaSy..., Bearer tokens, etc.
  return text
    .replace(/sk-[a-zA-Z0-9_-]{10,}/g, 'sk-***REDACTED***')
    .replace(/sk-ant-[a-zA-Z0-9_-]{10,}/g, 'sk-ant-***REDACTED***')
    .replace(/AIzaSy[a-zA-Z0-9_-]{10,}/g, 'AIzaSy***REDACTED***')
    .replace(/spnd_live_[a-zA-Z0-9]{10,}/g, 'spnd_live_***REDACTED***')
    .replace(/Bearer\s+[a-zA-Z0-9._-]{20,}/g, 'Bearer ***REDACTED***');
}

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalHttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request as any).requestId || 'unknown';

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: (exception as any)?.message || 'Internal server error' };

    const errorMessage =
      typeof exceptionResponse === 'object' && (exceptionResponse as any).message
        ? (exceptionResponse as any).message
        : exceptionResponse;

    // Scrub secrets from logged output
    const safeMessage = typeof errorMessage === 'string'
      ? scrubSecrets(errorMessage)
      : JSON.stringify(errorMessage);

    this.logger.error(
      `[${request.method}] ${request.url} - Status: ${status} - RequestId: ${requestId} - Error: ${scrubSecrets(safeMessage)}`,
    );

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId,
      error: typeof exceptionResponse === 'object' ? exceptionResponse : { message: errorMessage },
    });
  }
}
