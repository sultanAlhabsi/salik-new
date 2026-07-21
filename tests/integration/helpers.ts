import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterEach, beforeEach } from "vitest";
import { createApp } from "../../src/server/app";
import { seedDatabase } from "../../src/server/services/seed";
import { createIsolatedPostgresSchema } from "../helpers/postgres";
import {
  createRoleTestActors,
  type RoleTestActors,
} from "./auth-helpers";
import { createTestFactories, type TestFactories } from "./factories";

type SeedResult = Awaited<ReturnType<typeof seedDatabase>>;

export type TestDatabase = {
  prisma: PrismaClient;
  agent: ReturnType<typeof request.agent>;
  databaseScope: string;
  seed: SeedResult | null;
  factories: TestFactories;
  actors: RoleTestActors | null;
  login: (email: string, password?: string) => Promise<void>;
  dispose: () => Promise<void>;
};

export type TestContext = {
  prisma: PrismaClient;
  agent: ReturnType<typeof request.agent>;
  databaseScope: string;
  seed: SeedResult;
  factories: TestFactories;
  actors: RoleTestActors;
  login: (email: string, password?: string) => Promise<void>;
};

export async function createTestDatabase(
  options: { seed?: boolean } = {},
): Promise<TestDatabase> {
  const scope = await createIsolatedPostgresSchema({ prefix: "integration" });
  const { prisma } = scope;

  try {
    const seed = options.seed === false ? null : await seedDatabase(prisma);
    const factories = createTestFactories(prisma);
    const app = createApp({ prisma });
    const agent = request.agent(app);
    const actors = seed
      ? await createRoleTestActors({ app, prisma, factories, seed })
      : null;
    const login = async (email: string, password = "Password123!") => {
      const response = await agent
        .post("/api/auth/login")
        .send({ email, password });
      if (response.status !== 200) {
        throw new Error(
          `Login failed for ${email}: ${response.status} ${response.text}`,
        );
      }
    };
    const dispose = scope.dispose;

    return {
      prisma,
      agent,
      databaseScope: scope.schema,
      seed,
      factories,
      actors,
      login,
      dispose,
    };
  } catch (error) {
    await scope.dispose();
    throw error;
  }
}

export async function withTestDatabase<T>(
  callback: (testDatabase: TestDatabase) => Promise<T>,
  options: { seed?: boolean } = {},
) {
  const testDatabase = await createTestDatabase(options);
  try {
    return await callback(testDatabase);
  } finally {
    await testDatabase.dispose();
  }
}

export function useTestApp() {
  const context = {} as TestContext;

  beforeEach(async () => {
    const testDatabase = await createTestDatabase();
    context.databaseScope = testDatabase.databaseScope;
    context.prisma = testDatabase.prisma;
    context.seed = testDatabase.seed!;
    context.agent = testDatabase.agent;
    context.factories = testDatabase.factories;
    context.actors = testDatabase.actors!;
    context.login = testDatabase.login;
    Object.defineProperty(context, "dispose", {
      configurable: true,
      value: testDatabase.dispose,
    });
  });

  afterEach(async () => {
    await (
      context as TestContext & { dispose?: () => Promise<void> }
    ).dispose?.();
  });

  return context;
}
