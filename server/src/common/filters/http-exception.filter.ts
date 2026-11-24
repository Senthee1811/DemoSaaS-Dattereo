import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

import { scrubSecrets } from '@/common/scrub-secrets';

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalHttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request as any).requestId || 'unknown';

    // Express body-parser raises plain errors with an exposable 4xx status
    // (413 entity.too.large, 400 entity.parse.failed). Surface them as such, not as 500.
    const parserError = exception as { status?: number; expose?: boolean; type?: string } | null;
    const bodyParserStatus =
      !(exception instanceof HttpException) &&
      parserError?.expose === true &&
      typeof parserError.status === 'number' &&
      parserError.status >= 400 &&
      parserError.status < 500
        ? parserError.status
        : null;

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : bodyParserStatus ?? HttpStatus.INTERNAL_SERVER_ERROR;

    const isHttp = exception instanceof HttpException;
    const rawResponse: any = isHttp ? exception.getResponse() : null;

    // Normalise every error into a single, flat `error` object:
    //   { error: { message: string, type?, code?, ... } }
    // Gateway errors already arrive as { error: {...} } — unwrap instead of double-nesting.
    let errorBody: Record<string, any>;
    if (bodyParserStatus === 413) {
      errorBody = { message: 'Request body is too large.', type: 'payload_too_large' };
    } else if (bodyParserStatus !== null) {
      errorBody = { message: 'Request body is not valid JSON.', type: 'invalid_request_error' };
    } else if (!isHttp) {
      // Never leak internal exception text (DB errors, stack details) to clients
      errorBody = { message: 'Internal server error', type: 'internal_error' };
    } else if (rawResponse && typeof rawResponse === 'object' && rawResponse.error && typeof rawResponse.error === 'object') {
      errorBody = { ...rawResponse.error };
    } else if (rawResponse && typeof rawResponse === 'object') {
      const msg = Array.isArray(rawResponse.message) ? rawResponse.message.join('; ') : rawResponse.message;
      errorBody = { message: msg || exception.message, type: typeof rawResponse.error === 'string' ? rawResponse.error : undefined };
    } else {
      errorBody = { message: String(rawResponse) };
    }
    if (typeof errorBody.message === 'string') {
      errorBody.message = scrubSecrets(errorBody.message);
    }

    const logDetail = isHttp
      ? errorBody.message
      : `${(exception as any)?.message || exception}`;
    const logLine = `[${request.method}] ${request.url} - Status: ${status} - RequestId: ${requestId} - Error: ${scrubSecrets(String(logDetail))}`;
    if (status >= 500) {
      this.logger.error(logLine, isHttp ? undefined : (exception as any)?.stack);
    } else {
      this.logger.warn(logLine);
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId,
      error: errorBody,
      // Back-compat for clients that read a top-level message
      message: errorBody.message,
    });
  }
}
