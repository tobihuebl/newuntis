import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';

function isPrismaKnownError(e: unknown): e is { code: string } {
  return (
    typeof e === 'object' &&
    e !== null &&
    (e as { constructor?: { name?: string } }).constructor?.name === 'PrismaClientKnownRequestError'
  );
}

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
    } else if (isPrismaKnownError(exception)) {
      // Datenbankfehler verständlich abbilden; die Transaktion der Anfrage wird zurückgerollt.
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        body = { title: 'Existiert bereits' };
      } else if (exception.code === 'P2003') {
        status = HttpStatus.CONFLICT;
        body = { title: 'Wird noch verwendet und kann nicht geändert oder gelöscht werden' };
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        body = { title: 'Nicht gefunden' };
      } else {
        this.logger.error(`Datenbankfehler ${exception.code}`);
      }
    } else {
      this.logger.error(exception instanceof Error ? exception.message : 'Unbekannter Fehler');
    }
    void reply
      .status(status)
      .header('content-type', 'application/problem+json')
      .send({ type: 'about:blank', status, ...body });
  }
}
