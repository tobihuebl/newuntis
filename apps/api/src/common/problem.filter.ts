import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';

/** Fehler als application/problem+json (RFC 9457). */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger('Problem');

  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: Record<string, unknown> = { title: 'Interner Fehler' };
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      body = typeof res === 'string' ? { title: res } : { ...(res as Record<string, unknown>) };
      if (typeof body.message === 'string' && body.title === undefined) body.title = body.message;
      delete body.message;
      delete body.error;
      delete body.statusCode;
    } else {
      this.logger.error(exception instanceof Error ? exception.message : 'Unbekannter Fehler');
    }
    void reply
      .status(status)
      .header('content-type', 'application/problem+json')
      .send({ type: 'about:blank', status, ...body });
  }
}
