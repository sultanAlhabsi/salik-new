import type { PrismaClient, User, UserRole } from "@prisma/client";
import type { Express } from "express";
import request, { type Test } from "supertest";
import type { TestFactories } from "./factories";

export const testRoles = [
  "SUPER_ADMIN",
  "SUPPLIER_ADMIN",
  "SUPPLIER_STAFF",
  "STORE_ADMIN",
  "STORE_BUYER",
  "DRIVER",
] as const satisfies readonly UserRole[];

type SeedUsers = {
  superAdmin: User;
  freshAdmin: User;
  storeAdmin: User;
  freshDriver: User;
};

type SeedOrganizations = {
  freshSupplier: { id: string };
  alNoorStore: { id: string };
};

export type AuthorizationTest = Test & {
  expectUnauthorized: () => AuthorizationTest;
  expectForbidden: () => AuthorizationTest;
  expectNotFound: () => AuthorizationTest;
};

export type RoleTestAgent = {
  get: (path: string) => AuthorizationTest;
  post: (path: string) => AuthorizationTest;
  put: (path: string) => AuthorizationTest;
  patch: (path: string) => AuthorizationTest;
  delete: (path: string) => AuthorizationTest;
};

export type RoleActor = {
  role: UserRole;
  user: User;
  agent: RoleTestAgent;
};

export type RoleTestActors = {
  anonymous: RoleTestAgent;
  for: (role: UserRole) => RoleActor;
  loginAs: (
    role: UserRole,
    options?: { password?: string },
  ) => Promise<RoleActor>;
  expireSessions: (role: UserRole) => Promise<void>;
  revokeSessions: (role: UserRole) => Promise<void>;
};

function withAuthorizationAssertions(test: Test): AuthorizationTest {
  const authorizationTest = test as AuthorizationTest;
  authorizationTest.expectUnauthorized = () =>
    authorizationTest.expect(401).expect("Content-Type", /json/);
  authorizationTest.expectForbidden = () =>
    authorizationTest.expect(403).expect("Content-Type", /json/);
  authorizationTest.expectNotFound = () => authorizationTest.expect(404);
  return authorizationTest;
}

function wrapAgent(raw: ReturnType<typeof request.agent>): RoleTestAgent {
  return {
    get: (path) => withAuthorizationAssertions(raw.get(path)),
    post: (path) => withAuthorizationAssertions(raw.post(path)),
    put: (path) => withAuthorizationAssertions(raw.put(path)),
    patch: (path) => withAuthorizationAssertions(raw.patch(path)),
    delete: (path) => withAuthorizationAssertions(raw.delete(path)),
  };
}

export async function createRoleTestActors(input: {
  app: Express;
  prisma: PrismaClient;
  factories: TestFactories;
  seed: { users: SeedUsers; organizations: SeedOrganizations; password: string };
}): Promise<RoleTestActors> {
  const { app, prisma, factories, seed } = input;
  const [supplierStaff, storeBuyer] = await Promise.all([
    factories.user({
      email: "supplier.staff@example.test",
      name: "Supplier Staff Test Actor",
      role: "SUPPLIER_STAFF",
      organizationId: seed.organizations.freshSupplier.id,
    }),
    factories.user({
      email: "store.buyer@example.test",
      name: "Store Buyer Test Actor",
      role: "STORE_BUYER",
      organizationId: seed.organizations.alNoorStore.id,
    }),
  ]);

  const users = new Map<UserRole, User>([
    ["SUPER_ADMIN", seed.users.superAdmin],
    ["SUPPLIER_ADMIN", seed.users.freshAdmin],
    ["SUPPLIER_STAFF", supplierStaff],
    ["STORE_ADMIN", seed.users.storeAdmin],
    ["STORE_BUYER", storeBuyer],
    ["DRIVER", seed.users.freshDriver],
  ]);
  const actors = new Map<UserRole, RoleActor>();
  for (const role of testRoles) {
    actors.set(role, {
      role,
      user: users.get(role)!,
      agent: wrapAgent(request.agent(app)),
    });
  }

  const actorFor = (role: UserRole) => {
    const actor = actors.get(role);
    if (!actor) throw new Error(`No test actor configured for role ${role}`);
    return actor;
  };

  return {
    anonymous: wrapAgent(request.agent(app)),
    for: actorFor,
    async loginAs(role, options = {}) {
      const actor = actorFor(role);
      const response = await actor.agent.post("/api/auth/login").send({
        email: actor.user.email,
        password: options.password ?? seed.password,
      });
      if (response.status !== 200) {
        throw new Error(`Login failed for ${actor.user.email}: ${response.status}`);
      }
      return actor;
    },
    async expireSessions(role) {
      await prisma.session.updateMany({
        where: { userId: actorFor(role).user.id, revokedAt: null },
        data: { expiresAt: new Date(0) },
      });
    },
    async revokeSessions(role) {
      await prisma.session.updateMany({
        where: { userId: actorFor(role).user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    },
  };
}
