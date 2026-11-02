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

// Our own apps (website, iPhone app) add this header to every request.
// A malicious website can't: a browser only sends a custom header to
// another site after asking the server first (CORS preflight), and our
// CORS rule allows only our own frontend.
export const CSRF_HEADER = 'X-Requested-With';
export const CSRF_HEADER_VALUE = 'family-finance';

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
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', CSRF_HEADER],
      maxAge: 600,
    }),
  );

  app.use(csrfProtection);

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

// CSRF protection. Three layers, each one enough on its own:
//   1. the login cookie is SameSite=Strict: browsers don't send it
//      with requests started by other sites
//   2. Origin check: a request that changes data and comes from a
//      browser must come from our own frontend
//   3. custom header: every request that changes data must carry
//      X-Requested-With: family-finance, which other sites can't add
export function csrfProtection(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const isReadOnlyMethod = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);

  if (isReadOnlyMethod) {
    return next();
  }

  const origin = req.get('origin');

  if (origin !== undefined && !config.frontendOrigins.includes(origin)) {
    return res.status(403).json({ message: 'Forbidden origin' });
  }

  if (req.get(CSRF_HEADER) !== CSRF_HEADER_VALUE) {
    return res.status(403).json({ message: 'Missing CSRF header' });
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
