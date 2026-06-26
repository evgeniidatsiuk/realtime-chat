import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ErrorBody = {
      statusCode: status,
      error: 'Internal Server Error',
      message: 'Unexpected error',
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const raw = exception.getResponse();
      if (typeof raw === 'string') {
        body = { statusCode: status, error: exception.name, message: raw };
      } else if (raw && typeof raw === 'object') {
        const payload = raw as Record<string, unknown>;
        body = {
          statusCode: status,
          error: (payload.error as string) ?? exception.name,
          message: (payload.message as string | string[]) ?? exception.message,
        };
      }
    } else if (exception instanceof Error) {
      this.logUnhandledError(exception);
    } else {
      this.logger.error('Unknown exception thrown', JSON.stringify(exception));
    }

    void response.status(status).send(body);
  }

  private logUnhandledError(error: Error): void {
    // Stack stays in logs only; the response body never includes it.
    this.logger.error(error.message, error.stack);
  }
}
