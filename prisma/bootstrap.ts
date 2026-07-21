import { PrismaClient } from '@prisma/client';
import { config } from '../src/server/config.js';
import {
  bootstrapPrivateAdmin,
  type BootstrapProvisioner
} from '../src/server/services/bootstrap.js';
import { provisionSupabaseUser } from '../src/server/services/supabase.js';

const confirmation = 'SALIK_PRIVATE_PILOT';
const required = [
  'BOOTSTRAP_ADMIN_EMAIL',
  'BOOTSTRAP_ADMIN_NAME',
  'BOOTSTRAP_ADMIN_PASSWORD'
] as const;

if (process.env.BOOTSTRAP_CONFIRM !== confirmation) {
  throw new Error('Private bootstrap requires BOOTSTRAP_CONFIRM=SALIK_PRIVATE_PILOT');
}
if (!config.isProduction) {
  throw new Error('Private bootstrap requires NODE_ENV=production');
}
const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(`Private bootstrap is missing: ${missing.join(', ')}`);
}

const provision: BootstrapProvisioner = (input) =>
  provisionSupabaseUser({
    email: input.email,
    password: input.password,
    name: input.name,
    role: input.role,
    organizationId: input.organizationId
  }).then((authUserId) => {
    if (!authUserId) throw new Error('Supabase bootstrap requires hosted Auth');
    return authUserId;
  });

const prisma = new PrismaClient({ datasourceUrl: config.databaseUrl });

async function main() {
  const result = await bootstrapPrivateAdmin(
    prisma,
    {
      email: process.env.BOOTSTRAP_ADMIN_EMAIL!,
      name: process.env.BOOTSTRAP_ADMIN_NAME!,
      password: process.env.BOOTSTRAP_ADMIN_PASSWORD!
    },
    provision
  );
  console.log(`Private administrator ready: ${result.created ? 'created' : 'reconciled'}`);
}

main()
  .catch(() => {
    console.error('Private administrator bootstrap failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
