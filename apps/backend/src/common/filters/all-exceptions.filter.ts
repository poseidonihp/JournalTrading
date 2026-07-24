import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Filtro global de excepciones.
 *
 * - Las `HttpException` (4xx/5xx intencionales) se propagan con su cuerpo, ya que
 *   son controladas por la aplicación y no filtran internals.
 * - Cualquier otro error se transforma en un 500 genérico: el detalle se loguea
 *   en el servidor con el `requestId`, pero al cliente sólo le llega un mensaje
 *   neutro (evita fugas de stacks o mensajes crudos de Prisma).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly isProd: boolean) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();
    const requestId = request.id;

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        this.logger.error(`[${requestId}] ${request.method} ${request.url}`, exception.stack);
      }
      reply.status(status).send(this.buildHttpPayload(exception, requestId, request.url));
      return;
    }

    this.logger.error(
      `[${requestId}] ${request.method} ${request.url} — error no controlado`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    reply.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Error interno del servidor',
      // En desarrollo añadimos el detalle para depurar; en producción nunca.
      ...(this.isProd || !(exception instanceof Error) ? {} : { detail: exception.message }),
      requestId,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private buildHttpPayload(
    exception: HttpException,
    requestId: string,
    path: string,
  ): Record<string, unknown> {
    const status = exception.getStatus();
    const response = exception.getResponse();
    const base = {
      statusCode: status,
      requestId,
      timestamp: new Date().toISOString(),
      path,
    };
    if (typeof response === 'string') {
      return { ...base, message: response };
    }
    return { ...base, ...response };
  }
}
