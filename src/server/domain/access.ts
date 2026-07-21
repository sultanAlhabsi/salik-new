import type { User, UserRole } from '@prisma/client';
import { forbidden } from './errors.js';

export type AuthUser = Pick<User, 'id' | 'email' | 'name' | 'role' | 'organizationId' | 'status'> & {
  authUserId?: string | null;
};

export function portalForRole(role: UserRole) {
  if (role === 'SUPER_ADMIN') return 'admin';
  if (role === 'DRIVER') return 'driver';
  if (role === 'STORE_ADMIN' || role === 'STORE_BUYER') return 'store';
  return 'supplier';
}

export function requireRole(user: AuthUser, roles: UserRole[]) {
  if (!roles.includes(user.role)) {
    throw forbidden();
  }
}

export function requireOrganization(user: AuthUser) {
  if (!user.organizationId) {
    throw forbidden('This action requires an organization-bound user');
  }
  return user.organizationId;
}

export function assertSameOrganization(user: AuthUser, organizationId: string) {
  if (user.role !== 'SUPER_ADMIN' && user.organizationId !== organizationId) {
    throw forbidden('Cross-tenant access is not allowed');
  }
}
