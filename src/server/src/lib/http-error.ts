export type ErrorDetails = Record<string, unknown> | unknown[];

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: ErrorDetails;

  constructor(status: number, code: string, message: string, details?: ErrorDetails) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(message: string, details?: ErrorDetails): HttpError {
  return new HttpError(400, "bad_request", message, details);
}

export function unauthorized(message = "Authentication required"): HttpError {
  return new HttpError(401, "unauthorized", message);
}

export function forbidden(code: string, message: string): HttpError {
  return new HttpError(403, code, message);
}

export function notFound(message = "Not found"): HttpError {
  return new HttpError(404, "not_found", message);
}

export function conflict(code: string, message: string): HttpError {
  return new HttpError(409, code, message);
}

export function payloadTooLarge(message = "Payload too large"): HttpError {
  return new HttpError(413, "payload_too_large", message);
}

