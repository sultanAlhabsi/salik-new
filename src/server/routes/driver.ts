import { Router } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { formatBaisa } from '../domain/money.js';
import { requireAnyRole, requireAuth, type RequestWithUser } from '../middleware/auth.js';
import { updateDriverDeliveryStatus } from '../services/deliveries.js';

export function driverRoutes(prisma: PrismaClient) {
  const router = Router();
  router.use(requireAuth, requireAnyRole(['DRIVER']));

  router.get('/dashboard', async (req: RequestWithUser, res, next) => {
    try {
      const deliveries = await prisma.delivery.findMany({
        where: { driverId: req.user!.id },
        include: { order: { include: { store: true, items: true } } },
        orderBy: { updatedAt: 'desc' }
      });
      res.json({
        stats: {
          assigned: deliveries.filter((delivery) => delivery.status === 'ASSIGNED').length,
          active: deliveries.filter((delivery) => ['ACCEPTED', 'OUT_FOR_DELIVERY'].includes(delivery.status)).length,
          delivered: deliveries.filter((delivery) => delivery.status === 'DELIVERED').length
        },
        deliveries: serializeDriverDeliveries(deliveries)
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/deliveries', async (req: RequestWithUser, res, next) => {
    try {
      const deliveries = await prisma.delivery.findMany({
        where: { driverId: req.user!.id },
        include: { order: { include: { store: true, items: true, deliveryAddress: true } }, events: true },
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }]
      });
      res.json({ deliveries: serializeDriverDeliveries(deliveries) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/deliveries/:id/status', async (req: RequestWithUser, res, next) => {
    try {
      const deliveryId = z.string().parse(req.params.id);
      const input = z
        .object({
          status: z.enum(['ACCEPTED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED']),
          recipientName: z.string().optional(),
          proofNote: z.string().optional(),
          failureReason: z.string().optional()
        })
        .parse(req.body);
      const delivery = await updateDriverDeliveryStatus(prisma, {
        driverUser: req.user!,
        deliveryId,
        ...input
      });
      res.json({ delivery });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function serializeDriverDeliveries(deliveries: any[]) {
  return deliveries.map((delivery) => ({
    ...delivery,
    order: {
      ...delivery.order,
      totalFormatted: formatBaisa(delivery.order.totalBaisa)
    }
  }));
}
