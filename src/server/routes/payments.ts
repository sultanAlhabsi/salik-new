import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { config } from '../config.js';
import { unauthorized } from '../domain/errors.js';
import { processPaymentWebhook } from '../services/payments.js';

export function paymentRoutes(prisma: PrismaClient) {
  const router = Router();

  router.post('/webhook', async (req, res, next) => {
    try {
      const presentedSecret = req.get('x-salik-webhook-secret') ?? '';
      const expectedSecret = config.paymentWebhookSecret;
      const validSecret =
        presentedSecret.length === expectedSecret.length &&
        timingSafeEqual(Buffer.from(presentedSecret), Buffer.from(expectedSecret));
      if (!validSecret) throw unauthorized('Invalid payment webhook credentials');
      const input = z
        .object({
          orderId: z.string(),
          provider: z.string().min(2),
          providerReference: z.string().min(2),
          idempotencyKey: z.string().min(8),
          status: z.enum(['AUTHORIZED', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED'])
        })
        .parse(req.body);
      const result = await processPaymentWebhook(prisma, input);
      res.json({ attempt: result.attempt, order: result.order, reused: result.reused });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
