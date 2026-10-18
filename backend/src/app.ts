// config must be imported first: it validates .env and stops the
// server if something important is missing
import './config';

import cookieParser from 'cookie-parser';
import express from 'express';

import { analyticsRouter } from './analytics';
import { authRouter, blockDemoWrites, requireAuth } from './auth';
import { financeRouter } from './routes/finance';
import { monobankRouter } from './routes/monobank';
import { settingsRouter } from './routes/settings';
import {
  applySecurityMiddleware,
  errorHandler,
  notFoundHandler,
} from './security';

// =========================
// APP
// The order matters: security first, then public auth routes,
// then the login wall, then everything that needs a logged-in user.
// =========================

export const app = express();

applySecurityMiddleware(app);

// Small body limit: nobody needs to send megabytes of JSON here
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.get('/', (req, res) => {
  res.json({ message: 'Family Finance API is working!' });
});

// Public routes: login / register / logout / me
app.use(authRouter);

// Everything under /api below this line requires login.
// The read-only demo account can't change data.
app.use('/api', requireAuth, blockDemoWrites);

app.use(financeRouter);
app.use(monobankRouter);
app.use(settingsRouter);
app.use(analyticsRouter);

app.use(notFoundHandler);
app.use(errorHandler);
