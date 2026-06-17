import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import meRouter from './routes/auth/me.js';
import resetRouter from './routes/auth/reset.js';
import candidatesRouter from './routes/candidates.js';
import jobsRouter from './routes/jobs.js';
import matchingRouter from './routes/matching.js';
import interviewsRouter from './routes/interviews.js';
import analyticsRouter from './routes/analytics.js';

function normalizeOrigin(origin) {
  return String(origin || '').trim().replace(/\/+$/, '');
}

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  const allowedOrigins = new Set([
    process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ].map(normalizeOrigin));

  const isDev = process.env.NODE_ENV !== 'production';
  app.use(cors({
    origin: (origin, callback) => {
      const normalizedOrigin = normalizeOrigin(origin);
      if (!origin || allowedOrigins.has(normalizedOrigin)) return callback(null, true);
      if (isDev && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalizedOrigin)) return callback(null, true);
      callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
  }));

  app.use(express.json({ limit: '5mb' }));
  app.use(rateLimit({ windowMs: 60_000, max: 180 }));

  app.get('/health', (_req, res) => res.json({ ok: true, service: 'ai-recruitment-crm', version: '1.0.0' }));

  app.use('/api/me', meRouter);
  app.use('/api/auth/reset', resetRouter);
  app.use('/api/candidates', candidatesRouter);
  app.use('/api/jobs', jobsRouter);
  app.use('/api/matching', matchingRouter);
  app.use('/api/interviews', interviewsRouter);
  app.use('/api/analytics', analyticsRouter);

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

const app = createApp();
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const port = process.env.PORT || 4000;
  app.listen(port, () => console.log(`[ai-recruitment-crm] listening on :${port}`));
}
