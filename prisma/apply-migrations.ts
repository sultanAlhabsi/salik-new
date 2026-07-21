import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { applyMigrations } from '../src/server/services/migrations.js';

const prisma = new PrismaClient();

applyMigrations(prisma)
  .then(() => {
    console.log('Applied SALIK database migrations.');
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
