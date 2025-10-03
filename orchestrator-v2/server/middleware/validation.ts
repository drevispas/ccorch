import { Request, Response, NextFunction } from 'express';
import { z, ZodError, ZodSchema } from 'zod';
import { ServerLogger, LogLevel } from '../utils/logger';
import { LogContext } from '../../core/enums';

// Create a type-safe validated request interface
export interface ValidatedRequest<TBody = any, TParams = any, TQuery = any> extends Request {
  validatedBody?: TBody;
  validatedParams?: TParams;
  validatedQuery?: TQuery;
  correlationId?: string;
}

// Custom error class for validation failures
export class ValidationError extends Error {
  public statusCode: number;
  public errors: Array<{ path: string; message: string }>;

  constructor(errors: ZodError) {
    super('Validation failed');
    this.name = 'ValidationError';
    this.statusCode = 400;
    this.errors = errors.errors.map(err => ({
      path: err.path.join('.'),
      message: err.message
    }));
  }
}

// Request body validation middleware factory
export function validateRequestBody<T>(schema: ZodSchema<T>) {
  return async (req: ValidatedRequest<T>, res: Response, next: NextFunction) => {
    try {
      const validated = await schema.parseAsync(req.body);
      req.validatedBody = validated;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = new ValidationError(error);
        res.status(validationError.statusCode).json({
          error: 'Validation failed',
          details: validationError.errors,
          correlationId: req.correlationId
        });
      } else {
        next(error);
      }
    }
  };
}

// Request params validation middleware factory
export function validateRequestParams<T>(schema: ZodSchema<T>) {
  return async (req: ValidatedRequest<any, T>, res: Response, next: NextFunction) => {
    try {
      const validated = await schema.parseAsync(req.params);
      req.validatedParams = validated;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = new ValidationError(error);
        res.status(validationError.statusCode).json({
          error: 'Parameter validation failed',
          details: validationError.errors,
          correlationId: req.correlationId
        });
      } else {
        next(error);
      }
    }
  };
}

// Request query validation middleware factory
export function validateRequestQuery<T>(schema: ZodSchema<T>) {
  return async (req: ValidatedRequest<any, any, T>, res: Response, next: NextFunction) => {
    try {
      const validated = await schema.parseAsync(req.query);
      req.validatedQuery = validated;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = new ValidationError(error);
        res.status(validationError.statusCode).json({
          error: 'Query validation failed',
          details: validationError.errors,
          correlationId: req.correlationId
        });
      } else {
        next(error);
      }
    }
  };
}

// Response validation middleware factory
export function validateResponse<T>(schema: ZodSchema<T>, logger?: ServerLogger) {
  return (handler: (req: ValidatedRequest, res: Response, next: NextFunction) => Promise<T>) => {
    return async (req: ValidatedRequest, res: Response, next: NextFunction) => {
      try {
        // Execute the handler and get the response data
        const responseData = await handler(req, res, next);

        // Validate the response data
        const validated = await schema.parseAsync(responseData);

        // Send the validated response
        res.json(validated);
      } catch (error) {
        if (error instanceof ZodError) {
          // Log response validation error
          if (logger) {
            logger.logWithContext(LogLevel.ERROR, LogContext.VALIDATION, 'Response validation failed', {
              correlationId: req.correlationId,
              errors: JSON.stringify(error.errors),
              endpoint: `${req.method} ${req.path}`
            });
          }

          // In production, we might want to send a generic error to avoid exposing internal structure
          // In development, we can send detailed validation errors
          const isDevelopment = process.env.NODE_ENV !== 'production';

          if (isDevelopment) {
            res.status(500).json({
              error: 'Response validation failed',
              details: error.errors.map(err => ({
                path: err.path.join('.'),
                message: err.message
              })),
              correlationId: req.correlationId
            });
          } else {
            res.status(500).json({
              error: 'Internal server error',
              correlationId: req.correlationId
            });
          }
        } else {
          next(error);
        }
      }
    };
  };
}

// Combined validation middleware for both request and response
export function validate<TBody = any, TParams = any, TQuery = any, TResponse = any>(options: {
  body?: ZodSchema<TBody>;
  params?: ZodSchema<TParams>;
  query?: ZodSchema<TQuery>;
  response?: ZodSchema<TResponse>;
  logger?: ServerLogger;
}) {
  const middlewares: Array<any> = [];

  if (options.body) {
    middlewares.push(validateRequestBody(options.body));
  }

  if (options.params) {
    middlewares.push(validateRequestParams(options.params));
  }

  if (options.query) {
    middlewares.push(validateRequestQuery(options.query));
  }

  // Return a function that applies all middlewares
  return (handler: (req: ValidatedRequest<TBody, TParams, TQuery>, res: Response, next: NextFunction) => Promise<TResponse>) => {
    const wrappedHandler = options.response
      ? validateResponse(options.response, options.logger)(handler)
      : handler;

    return [...middlewares, wrappedHandler];
  };
}

// Error handler middleware for validation errors
export function validationErrorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  if (err instanceof ValidationError) {
    res.status(err.statusCode).json({
      error: err.message,
      details: err.errors,
      correlationId: (req as ValidatedRequest).correlationId
    });
  } else {
    next(err);
  }
}

// Type-safe response sender utility
export function sendValidatedResponse<T>(
  res: Response,
  schema: ZodSchema<T>,
  data: unknown,
  logger?: ServerLogger,
  correlationId?: string
): void {
  try {
    const validated = schema.parse(data);
    res.json(validated);
  } catch (error) {
    if (error instanceof ZodError && logger) {
      logger.logWithContext(LogLevel.ERROR, LogContext.VALIDATION, 'Response validation failed', {
        correlationId,
        errors: JSON.stringify(error.errors)
      });
    }

    // Send error response
    res.status(500).json({
      error: 'Response validation failed',
      correlationId
    });
  }
}