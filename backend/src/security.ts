import cors from 'cors';
import type {
  Express,
  NextFunction,
  Request,
  Response,
} from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

import { config } from './config';

// =========================
// SECURITY MIDDLEWARE
// Everything that protects the API before a request reaches the routes.
// =========================

export function applySecurityMiddleware(app: Express): void {
  // Hide "X-Powered-By: Express" (don't advertise what we run)
  app.disable('x-powered-by');

  // Behind a hosting proxy, trust exactly one hop so req.ip is correct
  if (config.trustProxy) {
    app.set('trust proxy', 1);
  }

  // Safe HTTP headers. This server returns only JSON, so the browser
  // is told to never run scripts or load anything from it.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      // HSTS only makes sense over HTTPS
      strictTransportSecurity: config.isProduction
        ? { maxAge: 31536000, includeSubDomains: true }
        : false,
    }),
  );

  // Only our frontend may call the API from a browser,
  // and it may send the login cookie.
  app.use(
    cors({
      origin: config.frontendOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type'],
      maxAge: 600,
    }),
  );

  app.use(rejectForeignOrigins);

  // General limit for the whole API: 300 requests / 15 min per IP
  app.use(
    '/api',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 300,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { message: 'Too many requests, slow down.' },
    }),
  );

  // Bank syncs are slow and use the Monobank quota: 30 / hour per IP
  app.use(
    '/api/monobank',
    rateLimit({
      windowMs: 60 * 60 * 1000,
      limit: 30,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { message: 'Too many sync requests, try later.' },
    }),
  );
}

// CSRF protection: a request that changes data and comes from a browser
// must come from our own frontend. Browsers always send the Origin
// header on such requests and a malicious site can't fake it.
function rejectForeignOrigins(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const isReadOnlyMethod = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  const origin = req.get('origin');

  if (
    !isReadOnlyMethod &&
    origin !== undefined &&
    !config.frontendOrigins.includes(origin)
  ) {
    return res.status(403).json({ message: 'Forbidden origin' });
  }

  return next();
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ message: 'Not found' });
}

// Last line of defense: log the real error on the server,
// send only a generic message to the client (no stack traces).
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction,
) {
  const status =
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number' &&
    error.status >= 400 &&
    error.status < 500
      ? error.status
      : 500;

  if (status === 500) {
    console.error(error);
  }

  res.status(status).json({
    message: status === 500 ? 'Internal server error' : 'Bad request',
  });
}
