import { PrismaClient } from '@prisma/client';
import { assertDemoSeedAllowed, seedDatabase } from '../src/server/services/seed.js';
import { isSupabaseEnabled, provisionSupabaseUser } from '../src/server/services/supabase.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for the demo seed');
assertDemoSeedAllowed(process.env, databaseUrl);

const prisma = new PrismaClient();

seedDatabase(prisma)
  .then(async (result) => {
    if (isSupabaseEnabled()) {
      for (const user of Object.values(result.users)) {
        const authUserId = await provisionSupabaseUser({
          email: user.email,
          password: result.password,
          name: user.name,
          role: user.role,
          organizationId: user.organizationId
        });
        if (authUserId) await prisma.user.update({ where: { id: user.id }, data: { authUserId } });
      }
    }
    console.log(`Seeded SALIK demo data${isSupabaseEnabled() ? ' and synchronized Supabase Auth' : ''}. Demo password: ${result.password}`);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
