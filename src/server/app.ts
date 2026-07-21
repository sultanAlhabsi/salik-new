import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import type { PrismaClient } from '@prisma/client';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { config } from './config.js';
import { AppError } from './domain/errors.js';
import { authMiddleware } from './middleware/auth.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { driverRoutes } from './routes/driver.js';
import { paymentRoutes } from './routes/payments.js';
import { organizationRoutes } from './routes/organization.js';
import { sharedRoutes } from './routes/shared.js';
import { storeRoutes } from './routes/store.js';
import { supplierRoutes } from './routes/supplier.js';

export function createApp({ prisma }: { prisma: PrismaClient }) {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: config.appOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(rateLimit({ windowMs: 60_000, limit: 240, standardHeaders: true, legacyHeaders: false }));
  app.use(authMiddleware(prisma));

  app.get('/api/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ ok: true, service: 'salik', timezone: config.omanTimezone });
    } catch {
      res.status(503).json({ ok: false, service: 'salik' });
    }
  });

  app.use('/api/auth', authRoutes(prisma));
  app.use('/api/admin', adminRoutes(prisma));
  app.use('/api/supplier', supplierRoutes(prisma));
  app.use('/api/store', storeRoutes(prisma));
  app.use('/api/driver', driverRoutes(prisma));
  app.use('/api/payments', paymentRoutes(prisma));
  app.use('/api/organization', organizationRoutes(prisma));
  app.use('/api', sharedRoutes(prisma));

  const clientDist = join(process.cwd(), 'dist', 'client');
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/')) {
        next();
        return;
      }
      res.sendFile(join(clientDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}

function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof AppError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message, details: error.details } });
    return;
  }
  if (typeof error === 'object' && error && 'name' in error && error.name === 'ZodError') {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Please check the submitted fields', details: error } });
    return;
  }
  console.error(error);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } });
}
