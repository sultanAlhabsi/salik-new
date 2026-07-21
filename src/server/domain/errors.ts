export class AppError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(code: string, message: string, details?: unknown) {
  return new AppError(400, code, message, details);
}

export function unauthorized(message = 'Authentication is required') {
  return new AppError(401, 'UNAUTHORIZED', message);
}

export function forbidden(message = 'You do not have permission to perform this action') {
  return new AppError(403, 'FORBIDDEN', message);
}

export function notFound(entity = 'Resource') {
  return new AppError(404, 'NOT_FOUND', `${entity} was not found`);
}

export function conflict(code: string, message: string, details?: unknown) {
  return new AppError(409, code, message, details);
}

export function serviceUnavailable(
  code: string,
  message: string,
  details?: unknown,
) {
  return new AppError(503, code, message, details);
}
