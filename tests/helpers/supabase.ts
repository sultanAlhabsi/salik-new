import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { nanoid } from "nanoid";
import { vi } from "vitest";
import { createFailureController } from "./async-controls";

export type SupabaseFailurePoint =
  | "auth.signInWithPassword"
  | "auth.refreshSession"
  | "auth.getUser"
  | "auth.resetPasswordForEmail"
  | "auth.admin.createUser"
  | "auth.admin.getUserById"
  | "auth.admin.listUsers"
  | "auth.admin.updateUserById"
  | "auth.admin.signOut"
  | "storage.upload"
  | "storage.download"
  | "storage.remove";

type SeedUserInput = Partial<User> & { email: string; password: string };

function buildUser(input: SeedUserInput): User {
  const createdAt = new Date().toISOString();
  const { email, password: _password, ...overrides } = input;
  void _password;
  return {
    id: overrides.id ?? `auth-${nanoid(10)}`,
    aud: "authenticated",
    role: "authenticated",
    email: email.toLowerCase(),
    app_metadata: {},
    user_metadata: {},
    created_at: createdAt,
    ...overrides,
  };
}

function buildSession(user: User): Session {
  return {
    access_token: `access-${nanoid(18)}`,
    refresh_token: `refresh-${nanoid(18)}`,
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user,
  };
}

async function bodyToBuffer(body: unknown) {
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Blob) return Buffer.from(await body.arrayBuffer());
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (ArrayBuffer.isView(body))
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  return Buffer.from(String(body));
}

export function createSupabaseDouble() {
  const users = new Map<string, User>();
  const passwords = new Map<string, string>();
  const sessions = new Map<string, Session>();
  const objects = new Map<string, Buffer>();
  const failures = createFailureController<SupabaseFailurePoint>();
  const resetRequests: Array<{ email: string; redirectTo?: string }> = [];

  const takeFailure = (point: SupabaseFailurePoint) => {
    return failures.take(point);
  };
  const rememberSession = (session: Session) => {
    sessions.set(session.access_token, session);
    sessions.set(session.refresh_token, session);
    return session;
  };
  const seedUser = (input: SeedUserInput) => {
    const user = buildUser(input);
    users.set(user.id, user);
    passwords.set(user.id, input.password);
    return user;
  };

  const signInWithPassword = vi.fn(
    async (credentials: { email: string; password: string }) => {
      const failure = takeFailure("auth.signInWithPassword");
      if (failure)
        return { data: { user: null, session: null }, error: failure };
      const user = [...users.values()].find(
        (candidate) => candidate.email === credentials.email.toLowerCase(),
      );
      if (!user || passwords.get(user.id) !== credentials.password) {
        return {
          data: { user: null, session: null },
          error: new Error("Invalid login credentials"),
        };
      }
      const session = rememberSession(buildSession(user));
      return { data: { user, session }, error: null };
    },
  );
  const refreshSession = vi.fn(async (input: { refresh_token: string }) => {
    const failure = takeFailure("auth.refreshSession");
    if (failure) return { data: { user: null, session: null }, error: failure };
    const previous = sessions.get(input.refresh_token);
    if (!previous)
      return {
        data: { user: null, session: null },
        error: new Error("Invalid refresh token"),
      };
    const session = rememberSession(buildSession(previous.user));
    return { data: { user: previous.user, session }, error: null };
  });
  const getUser = vi.fn(async (accessToken: string) => {
    const failure = takeFailure("auth.getUser");
    if (failure) return { data: { user: null }, error: failure };
    const user = sessions.get(accessToken)?.user ?? null;
    return { data: { user }, error: user ? null : new Error("User not found") };
  });
  const resetPasswordForEmail = vi.fn(
    async (email: string, options?: { redirectTo?: string }) => {
      const failure = takeFailure("auth.resetPasswordForEmail");
      if (failure) return { data: null, error: failure };
      resetRequests.push({
        email: email.toLowerCase(),
        redirectTo: options?.redirectTo,
      });
      return { data: {}, error: null };
    },
  );
  const createUser = vi.fn(
    async (attributes: {
      email?: string;
      password?: string;
      user_metadata?: Record<string, unknown>;
      app_metadata?: Record<string, unknown>;
    }) => {
      const failure = takeFailure("auth.admin.createUser");
      if (failure) return { data: { user: null }, error: failure };
      const user = seedUser({
        email: attributes.email ?? `${nanoid(8)}@example.test`,
        password: attributes.password ?? "Password123!",
        user_metadata: attributes.user_metadata ?? {},
        app_metadata: attributes.app_metadata ?? {},
      });
      return { data: { user }, error: null };
    },
  );
  const getUserById = vi.fn(async (id: string) => {
    const failure = takeFailure("auth.admin.getUserById");
    if (failure) return { data: { user: null }, error: failure };
    const user = users.get(id) ?? null;
    return { data: { user }, error: user ? null : new Error("User not found") };
  });
  const listUsers = vi.fn(
    async (options: { page?: number; perPage?: number } = {}) => {
      const failure = takeFailure("auth.admin.listUsers");
      if (failure)
        return { data: { users: [], aud: "authenticated" }, error: failure };
      const page = options.page ?? 1;
      const perPage = options.perPage ?? 50;
      const allUsers = [...users.values()];
      return {
        data: {
          users: allUsers.slice((page - 1) * perPage, page * perPage),
          aud: "authenticated",
          page,
          per_page: perPage,
          total: allUsers.length,
          last_page: Math.max(1, Math.ceil(allUsers.length / perPage)),
        },
        error: null,
      };
    },
  );
  const updateUserById = vi.fn(
    async (
      id: string,
      attributes: {
        password?: string;
        user_metadata?: Record<string, unknown>;
        app_metadata?: Record<string, unknown>;
      },
    ) => {
      const failure = takeFailure("auth.admin.updateUserById");
      if (failure) return { data: { user: null }, error: failure };
      const current = users.get(id);
      if (!current)
        return { data: { user: null }, error: new Error("User not found") };
      const user = {
        ...current,
        user_metadata: attributes.user_metadata ?? current.user_metadata,
        app_metadata: attributes.app_metadata ?? current.app_metadata,
        updated_at: new Date().toISOString(),
      };
      users.set(id, user);
      if (attributes.password) passwords.set(id, attributes.password);
      return { data: { user }, error: null };
    },
  );
  const signOut = vi.fn(async (accessToken: string) => {
    const failure = takeFailure("auth.admin.signOut");
    if (failure) return { data: null, error: failure };
    const session = sessions.get(accessToken);
    if (session) {
      sessions.delete(session.access_token);
      sessions.delete(session.refresh_token);
    }
    return { data: null, error: null };
  });
  const from = vi.fn((bucket: string) => ({
    upload: vi.fn(
      async (path: string, body: unknown, options?: { upsert?: boolean }) => {
        const failure = takeFailure("storage.upload");
        if (failure) return { data: null, error: failure };
        const key = `${bucket}/${path}`;
        if (objects.has(key) && !options?.upsert)
          return { data: null, error: new Error("Duplicate") };
        objects.set(key, await bodyToBuffer(body));
        return { data: { path, fullPath: key }, error: null };
      },
    ),
    download: vi.fn(async (path: string) => {
      const failure = takeFailure("storage.download");
      if (failure) return { data: null, error: failure };
      const body = objects.get(`${bucket}/${path}`);
      return body
        ? { data: new Blob([new Uint8Array(body)]), error: null }
        : { data: null, error: new Error("Object not found") };
    }),
    remove: vi.fn(async (paths: string[]) => {
      const failure = takeFailure("storage.remove");
      if (failure) return { data: null, error: failure };
      for (const path of paths) objects.delete(`${bucket}/${path}`);
      return { data: paths.map((name) => ({ name })), error: null };
    }),
  }));

  const authClient = {
    auth: { signInWithPassword, refreshSession, resetPasswordForEmail },
  } as unknown as SupabaseClient;
  const adminClient = {
    auth: {
      getUser,
      admin: { createUser, getUserById, listUsers, updateUserById, signOut },
    },
    storage: { from },
  } as unknown as SupabaseClient;

  return {
    authClient,
    adminClient,
    seedUser,
    resetRequests,
    failNext(point: SupabaseFailurePoint, error: Error) {
      failures.failNext(point, error);
    },
  };
}
