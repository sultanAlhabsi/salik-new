import { PrismaClient } from '@prisma/client';
import { config } from '../src/server/config.js';
import {
  assertHostedDemoBootstrapAllowed,
  bootstrapHostedDemo,
  type HostedDemoProvisioner
} from '../src/server/services/hosted-demo.js';
import {
  isSupabaseEnabled,
  provisionSupabaseUser
} from '../src/server/services/supabase.js';

assertHostedDemoBootstrapAllowed(process.env, isSupabaseEnabled());

const provision: HostedDemoProvisioner = (input) =>
  provisionSupabaseUser(input).then((authUserId) => {
    if (!authUserId) throw new Error('Hosted demo bootstrap requires Supabase Auth');
    return authUserId;
  });

const prisma = new PrismaClient({ datasourceUrl: config.databaseUrl });

async function main() {
  const result = await bootstrapHostedDemo(prisma, provision);
  console.log(
    `Hosted demo ready: ${result.createdUsers} users created, ${result.reconciledUsers} reconciled`
  );
}

main()
  .catch(() => {
    console.error('Hosted demo bootstrap failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
