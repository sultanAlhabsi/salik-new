import { createReadStream, createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import multer from 'multer';
import { Router } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { nanoid } from 'nanoid';
import { config } from '../config.js';
import { requireOrganization } from '../domain/access.js';
import { badRequest, forbidden, notFound } from '../domain/errors.js';
import { requireAuth, type RequestWithUser } from '../middleware/auth.js';
import { formatBaisa } from '../domain/money.js';
import { buildStoragePath, getSupabaseAdmin, isSupabaseEnabled } from '../services/supabase.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes }
});

const allowedMimeTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']);
const allowedExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.pdf']);

export function sharedRoutes(prisma: PrismaClient) {
  const router = Router();

  router.get('/notifications', requireAuth, async (req: RequestWithUser, res, next) => {
    try {
      const organizationId = req.user!.organizationId;
      const notifications = await prisma.notification.findMany({
        where: {
          OR: [{ userId: req.user!.id }, ...(organizationId ? [{ organizationId }] : [])]
        },
        orderBy: { createdAt: 'desc' },
        take: 50
      });
      res.json({ notifications });
    } catch (error) {
      next(error);
    }
  });

  router.post('/notifications/:id/read', requireAuth, async (req: RequestWithUser, res, next) => {
    try {
      const notificationId = String(req.params.id);
      const organizationId = req.user!.organizationId;
      const notification = await prisma.notification.findFirst({
        where: {
          id: notificationId,
          OR: [{ userId: req.user!.id }, ...(organizationId ? [{ organizationId }] : [])]
        }
      });
      if (!notification) throw forbidden();
      const updated = await prisma.notification.update({ where: { id: notification.id }, data: { readAt: new Date() } });
      res.json({ notification: updated });
    } catch (error) {
      next(error);
    }
  });

  router.get('/invoices', requireAuth, async (req: RequestWithUser, res, next) => {
    try {
      if (req.user!.role === 'DRIVER') throw forbidden();
      const organizationId = requireOrganization(req.user!);
      const where =
        req.user!.role === 'SUPER_ADMIN'
          ? {}
          : req.user!.role === 'STORE_ADMIN' || req.user!.role === 'STORE_BUYER'
            ? { storeId: organizationId }
            : { supplierId: organizationId };
      const invoices = await prisma.invoice.findMany({ where, include: { order: true }, orderBy: { createdAt: 'desc' }, take: 50 });
      res.json({ invoices });
    } catch (error) {
      next(error);
    }
  });

  router.get('/invoices/:id/print', requireAuth, async (req: RequestWithUser, res, next) => {
    try {
      if (req.user!.role === 'DRIVER') throw forbidden();
      const invoiceId = String(req.params.id);
      const organizationId = requireOrganization(req.user!);
      const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { order: { include: { items: true, supplier: true, store: true } } } });
      if (!invoice) throw forbidden();
      const allowed =
        req.user!.role === 'SUPER_ADMIN' || invoice.supplierId === organizationId || invoice.storeId === organizationId;
      if (!allowed) throw forbidden();
      res.header('Content-Type', 'text/html');
      const rows = invoice.order.items.map((item) => `<tr><td>${escapeHtml(item.nameSnapshot)}</td><td>${item.quantity}</td><td>${formatBaisa(item.unitPriceBaisa)}</td><td>${item.taxRateBps / 100}%</td><td>${formatBaisa(item.lineTotalBaisa)}</td></tr>`).join('');
      res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(invoice.invoiceNumber)}</title><style>body{font:14px Arial,sans-serif;color:#17221e;margin:40px}header{display:flex;justify-content:space-between;border-bottom:2px solid #087f5b;padding-bottom:20px}table{width:100%;border-collapse:collapse;margin:28px 0}th,td{text-align:left;padding:10px;border-bottom:1px solid #dce3de}.totals{margin-left:auto;width:280px}.totals p{display:flex;justify-content:space-between}.total{font-size:18px;font-weight:700}</style></head><body><header><div><h1>SALIK Invoice</h1><strong>${escapeHtml(invoice.invoiceNumber)}</strong></div><div>Status: ${invoice.status}<br>Issued: ${invoice.issueDate.toISOString().slice(0, 10)}</div></header><section><p><strong>Seller:</strong> ${escapeHtml(invoice.order.supplier.name)}</p><p><strong>Buyer:</strong> ${escapeHtml(invoice.order.store.name)}</p></section><table><thead><tr><th>Item</th><th>Quantity</th><th>Unit price</th><th>Tax</th><th>Line total</th></tr></thead><tbody>${rows}</tbody></table><div class="totals"><p><span>Subtotal</span><span>${formatBaisa(invoice.subtotalBaisa)}</span></p><p><span>Tax</span><span>${formatBaisa(invoice.taxBaisa)}</span></p><p class="total"><span>Total</span><span>${formatBaisa(invoice.totalBaisa)}</span></p></div></body></html>`);
    } catch (error) {
      next(error);
    }
  });

  router.post('/support', requireAuth, async (req: RequestWithUser, res, next) => {
    try {
      const organizationId = requireOrganization(req.user!);
      const input = z.object({ subject: z.string().min(3).max(160), message: z.string().min(5).max(4000) }).parse(req.body);
      const ticket = await prisma.supportTicket.create({ data: { organizationId, createdById: req.user!.id, ...input } });
      res.status(201).json({ ticket });
    } catch (error) {
      next(error);
    }
  });

  router.post('/files', requireAuth, upload.single('file'), async (req: RequestWithUser, res, next) => {
    try {
      const organizationId = requireOrganization(req.user!);
      const file = req.file;
      if (!file) throw badRequest('FILE_REQUIRED', 'A file is required');
      if (!allowedMimeTypes.has(file.mimetype)) {
        throw badRequest('UNSUPPORTED_FILE_TYPE', 'Only PNG, JPG, WEBP, and PDF files are supported');
      }
      if (!allowedExtensions.has(extname(file.originalname).toLowerCase())) {
        throw badRequest('UNSUPPORTED_FILE_EXTENSION', 'The file extension does not match an allowed upload type');
      }
      const entityType = String(req.body.entityType ?? '');
      const entityId = String(req.body.entityId ?? '');
      if (!entityType || !entityId) throw badRequest('ENTITY_REQUIRED', 'Files must be linked to an entity');
      await assertEntityAccess(prisma, req.user!, entityType, entityId);
      let storagePath: string;
      if (isSupabaseEnabled()) {
        if (!req.user!.authUserId) throw forbidden('Supabase identity is required for file uploads');
        const objectPath = buildStoragePath(organizationId, req.user!.authUserId, file.originalname);
        const { error } = await getSupabaseAdmin().storage.from(config.supabaseStorageBucket).upload(objectPath, file.buffer, {
          contentType: file.mimetype,
          upsert: false
        });
        if (error) throw error;
        storagePath = `supabase://${config.supabaseStorageBucket}/${objectPath}`;
      } else {
        storagePath = join('storage', 'uploads', organizationId, `${nanoid(18)}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
        mkdirSync(dirname(storagePath), { recursive: true });
        await pipeline(Readable.from(file.buffer), createWriteStream(storagePath));
      }
      let attachment;
      try {
        attachment = await prisma.attachment.create({
          data: {
            ownerOrgId: organizationId,
            uploadedById: req.user!.id,
            entityType,
            entityId,
            filename: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            storagePath
          }
        });
      } catch (error) {
        if (storagePath.startsWith('supabase://')) {
          const remote = parseSupabaseStoragePath(storagePath);
          await getSupabaseAdmin().storage.from(remote.bucket).remove([remote.path]);
        }
        throw error;
      }
      res.status(201).json({ attachment });
    } catch (error) {
      next(error);
    }
  });

  router.get('/files/:id', requireAuth, async (req: RequestWithUser, res, next) => {
    try {
      const attachment = await prisma.attachment.findUnique({ where: { id: String(req.params.id) } });
      if (!attachment) throw notFound('File');
      await assertEntityAccess(prisma, req.user!, attachment.entityType, attachment.entityId);
      res.setHeader('Content-Type', attachment.mimeType);
      res.setHeader('Content-Length', String(attachment.sizeBytes));
      res.setHeader('Content-Disposition', `inline; filename="${attachment.filename.replace(/["\r\n]/g, '_')}"`);
      if (attachment.storagePath.startsWith('supabase://')) {
        const remote = parseSupabaseStoragePath(attachment.storagePath);
        const { data, error } = await getSupabaseAdmin().storage.from(remote.bucket).download(remote.path);
        if (error || !data) throw notFound('Stored file');
        res.end(Buffer.from(await data.arrayBuffer()));
      } else {
        if (!existsSync(attachment.storagePath)) throw notFound('Stored file');
        createReadStream(attachment.storagePath).pipe(res);
      }
    } catch (error) {
      next(error);
    }
  });

  return router;
}

async function assertEntityAccess(prisma: PrismaClient, user: NonNullable<RequestWithUser['user']>, entityType: string, entityId: string) {
  if (user.role === 'SUPER_ADMIN') return;
  const organizationId = requireOrganization(user);
  if (entityType === 'product') {
    const product = await prisma.product.findFirst({ where: { id: entityId, supplierId: organizationId } });
    if (product && user.role.startsWith('SUPPLIER_')) return;
  }
  if (entityType === 'order') {
    const order = await prisma.order.findFirst({ where: { id: entityId, OR: [{ supplierId: organizationId }, { storeId: organizationId }] } });
    if (order && user.role !== 'DRIVER') return;
  }
  if (entityType === 'delivery') {
    const delivery = await prisma.delivery.findFirst({ where: { id: entityId, OR: [{ supplierId: organizationId }, { storeId: organizationId }, { driverId: user.id }] } });
    if (delivery) return;
  }
  if (entityType === 'support_ticket') {
    if (await prisma.supportTicket.findFirst({ where: { id: entityId, organizationId } })) return;
  }
  if (entityType === 'recurring_order' && user.role.startsWith('STORE_')) {
    if (await prisma.recurringOrder.findFirst({ where: { id: entityId, storeId: organizationId } })) return;
  }
  throw forbidden('You do not have access to files for this entity');
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]!);
}

function parseSupabaseStoragePath(storagePath: string) {
  const match = /^supabase:\/\/([^/]+)\/(.+)$/.exec(storagePath);
  if (!match) throw new Error('Invalid Supabase storage path');
  return { bucket: match[1], path: match[2] };
}
