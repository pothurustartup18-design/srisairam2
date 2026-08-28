import { Request, Response, NextFunction } from 'express';
import client from 'prom-client';

// Create registry
const register = new client.Registry();
client.collectDefaultMetrics({ register });

// Define custom metrics
const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests processed',
  labelNames: ['method', 'endpoint', 'status', 'school_id'],
  registers: [register]
});

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'endpoint', 'status', 'school_id'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1.0, 2.0, 5.0, 10.0],
  registers: [register]
});

const httpActiveRequests = new client.Gauge({
  name: 'http_active_requests',
  help: 'Current number of active HTTP requests',
  labelNames: ['method', 'endpoint', 'school_id'],
  registers: [register]
});

const httpExceptionsTotal = new client.Counter({
  name: 'http_exceptions_total',
  help: 'Total number of HTTP exceptions caught',
  labelNames: ['method', 'endpoint', 'exception_type', 'school_id'],
  registers: [register]
});

/**
 * Middleware to track HTTP metrics and log requests as structured JSON.
 */
export const monitorAndLogMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const path = req.path;
  // Skip metrics and health checks to avoid noise
  if (path === '/metrics' || path === '/health' || path.startsWith('/uploads/')) {
    return next();
  }

  const startTime = process.hrtime();
  const schoolId = (req.headers['x-school-id'] as string) || 'School A';
  const method = req.method;

  httpActiveRequests.labels({ method, endpoint: path, school_id: schoolId }).inc();

  res.on('finish', () => {
    const diff = process.hrtime(startTime);
    const durationSeconds = diff[0] + diff[1] / 1e9;
    const status = String(res.statusCode);

    httpActiveRequests.labels({ method, endpoint: path, school_id: schoolId }).dec();
    httpRequestsTotal.labels({ method, endpoint: path, status, school_id: schoolId }).inc();
    httpRequestDuration.labels({ method, endpoint: path, status, school_id: schoolId }).observe(durationSeconds);

    // Structured JSON log output to stdout (parsed by Fluent Bit)
    const logData = {
      timestamp: new Date().toISOString(),
      level: res.statusCode >= 500 ? 'ERROR' : 'INFO',
      message: `${method} ${path} - ${status} (${Math.round(durationSeconds * 1000)}ms)`,
      school_id: schoolId,
      endpoint: path,
      method: method,
      status: res.statusCode,
      duration_seconds: durationSeconds
    };
    console.log(JSON.stringify(logData));
  });

  next();
};

/**
 * Record an exception caught by global Express error handler.
 */
export const recordException = (req: Request, err: any) => {
  const path = req.path;
  const schoolId = (req.headers['x-school-id'] as string) || 'School A';
  const method = req.method;
  const exceptionType = err?.name || err?.constructor?.name || 'Error';

  httpExceptionsTotal.labels({
    method,
    endpoint: path,
    exception_type: exceptionType,
    school_id: schoolId
  }).inc();
};

/**
 * Controller/handler for Prometheus scraping.
 */
export const metricsHandler = async (req: Request, res: Response) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err: any) {
    res.status(500).end(err.message);
  }
};
