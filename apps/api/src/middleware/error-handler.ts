import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

/** Errors a route can throw to produce a specific, user-readable response. */
export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const notFound = (what: string) => new ApiError(404, 'NOT_FOUND', `${what} was not found.`);
export const badRequest = (message: string, code = 'BAD_REQUEST') => new ApiError(400, code, message);

/**
 * Turns every failure into `{ error: { code, message } }`.
 *
 * Unexpected errors are logged with their stack server-side and reported to the
 * client as a generic message: internal details are an information leak and are
 * useless to the person reading them.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: { code: 'ROUTE_NOT_FOUND', message: `No route for ${request.method} ${request.url}.` },
    });
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof ApiError) {
      request.log.info({ code: error.code, statusCode: error.statusCode }, 'Request rejected');
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details },
      });
    }

    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Some values in the request are not valid.',
          details: error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
        },
      });
    }

    if (error.validation) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: error.message },
      });
    }

    const status = error.statusCode ?? 500;
    if (status === 413) {
      return reply.status(413).send({
        error: { code: 'PAYLOAD_TOO_LARGE', message: 'That upload is larger than the limit.' },
      });
    }
    if (status < 500) {
      return reply.status(status).send({
        error: { code: error.code ?? 'REQUEST_FAILED', message: error.message },
      });
    }

    request.log.error({ err: error }, 'Unhandled error');
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong on our side. The failure has been logged.',
      },
    });
  });
}
