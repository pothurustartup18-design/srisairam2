import { Response } from 'express';

// Thrown by service-layer functions to signal a specific HTTP status/message
// (e.g. 404 not found, 400 validation) rather than the generic 500 fallback.
// `details` lets a service attach extra response fields (e.g. { userCreated: false,
// whatsappSent: false }) that the route's error handler merges into the JSON body.
export class ServiceError extends Error {
  status: number;
  details?: Record<string, unknown>;
  constructor(status: number, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ServiceError';
    this.status = status;
    this.details = details;
  }
}

export function success<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ success: true, data });
}

export function fail(res: Response, message: string, status = 500) {
  return res.status(status).json({ success: false, message });
}
