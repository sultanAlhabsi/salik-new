import { basename } from 'node:path';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { createAdminClient } from '@supabase/server/core';
import { nanoid } from 'nanoid';
import type { PrismaClient, UserRole } from '@prisma/client';
import { config } from '../config.js';

type Environment = Record<string, string | undefined>;

type SupabaseTestClients = {
  authClient: SupabaseClient;
  adminClient: SupabaseClient;
};

let testClients: SupabaseTestClients | null = null;

export function configureSupabaseForTests(clients: SupabaseTestClients) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Supabase test clients can only be configured in NODE_ENV=test');
  }
  const previous = testClients;
  testClients = clients;
  return () => {
    testClients = previous;
  };
}

export function resolveSupabaseMode(environment: Environment = process.env) {
  if (environment.SALIK_SUPABASE_DISABLED === 'true') return 'local' as const;
  return environment.SUPABASE_URL && environment.SUPABASE_PUBLISHABLE_KEY && environment.SUPABASE_SECRET_KEY
    ? ('supabase' as const)
    : ('local' as const);
}

export function isSupabaseEnabled() {
  if (testClients) return true;
  return !config.supabaseDisabled && resolveSupabaseMode() === 'supabase';
}

export function getSupabaseAdmin(): SupabaseClient {
  if (testClients) return testClients.adminClient;
  if (!isSupabaseEnabled()) throw new Error('Supabase is not configured');
  return createAdminClient();
}

export function createSupabaseAuthClient(): SupabaseClient {
  if (testClients) return testClients.authClient;
  if (!config.supabaseUrl || !config.supabasePublishableKey || !isSupabaseEnabled()) {
    throw new Error('Supabase is not configured');
  }
  return createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: 'implicit'
    }
  });
}

export async function resolveSupabaseIdentity(
  prisma: PrismaClient,
  authUser: Pick<User, 'id' | 'email'>
) {
  const email = authUser.email?.toLowerCase() ?? null;
  const byAuthUserId = await prisma.user.findUnique({
    where: { authUserId: authUser.id },
    include: { organization: true }
  });
  if (byAuthUserId) {
    return email && byAuthUserId.email === email ? byAuthUserId : null;
  }
  if (!email) return null;

  const byEmail = await prisma.user.findUnique({
    where: { email },
    include: { organization: true }
  });
  if (!byEmail || (byEmail.authUserId && byEmail.authUserId !== authUser.id)) {
    return null;
  }
  if (byEmail.authUserId === authUser.id) return byEmail;

  return prisma.user.update({
    where: { id: byEmail.id },
    data: { authUserId: authUser.id },
    include: { organization: true }
  });
}

export function buildStoragePath(
  organizationId: string,
  authUserId: string,
  filename: string,
  token = nanoid(18)
) {
  const safeFilename = basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, 'file');
  return `${organizationId}/${authUserId}/${token}-${safeFilename}`;
}

export async function provisionSupabaseUser(input: {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  organizationId: string | null;
}) {
  if (!isSupabaseEnabled()) return null;
  const admin = getSupabaseAdmin();
  const email = input.email.toLowerCase();
  let authUser = await findAuthUserByEmail(admin, email);

  if (!authUser) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: input.password,
      email_confirm: true,
      user_metadata: { name: input.name },
      app_metadata: { salik_role: input.role, salik_organization_id: input.organizationId }
    });
    if (error) throw error;
    authUser = data.user;
  } else {
    const { data, error } = await admin.auth.admin.updateUserById(authUser.id, {
      password: input.password,
      user_metadata: { ...authUser.user_metadata, name: input.name },
      app_metadata: {
        ...authUser.app_metadata,
        salik_role: input.role,
        salik_organization_id: input.organizationId
      }
    });
    if (error) throw error;
    authUser = data.user;
  }

  return authUser.id;
}

export async function updateSupabaseUserAccess(
  authUserId: string | null,
  input: { name?: string; role?: UserRole; organizationId?: string | null; active?: boolean }
) {
  if (!isSupabaseEnabled() || !authUserId) return;
  const admin = getSupabaseAdmin();
  const { data: current, error: readError } = await admin.auth.admin.getUserById(authUserId);
  if (readError) throw readError;
  const { error } = await admin.auth.admin.updateUserById(authUserId, {
    ...(input.name ? { user_metadata: { ...current.user.user_metadata, name: input.name } } : {}),
    ...(input.role || input.organizationId !== undefined
      ? {
          app_metadata: {
            ...current.user.app_metadata,
            ...(input.role ? { salik_role: input.role } : {}),
            ...(input.organizationId !== undefined ? { salik_organization_id: input.organizationId } : {})
          }
        }
      : {}),
    ...(input.active === undefined ? {} : { ban_duration: input.active ? 'none' : '876000h' })
  });
  if (error) throw error;
}

async function findAuthUserByEmail(admin: SupabaseClient, email: string): Promise<User | null> {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const match = data.users.find((user) => user.email?.toLowerCase() === email);
    if (match) return match;
    if (data.users.length < 100) return null;
  }
  return null;
}
