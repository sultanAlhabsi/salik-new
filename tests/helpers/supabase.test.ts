import { describe, expect, it } from "vitest";
import { createSupabaseDouble } from "./supabase";

describe("Supabase Auth and Storage test double", () => {
  it("implements the Auth methods used by the server with Supabase response shapes", async () => {
    const double = createSupabaseDouble();
    const user = double.seedUser({
      email: "buyer@example.test",
      password: "Password123!",
    });

    const signedIn = await double.authClient.auth.signInWithPassword({
      email: "buyer@example.test",
      password: "Password123!",
    });
    const refreshed = await double.authClient.auth.refreshSession({
      refresh_token: signedIn.data.session!.refresh_token,
    });
    const resolved = await double.adminClient.auth.getUser(
      refreshed.data.session!.access_token,
    );
    const listed = await double.adminClient.auth.admin.listUsers({
      page: 1,
      perPage: 100,
    });
    const updated = await double.adminClient.auth.admin.updateUserById(
      user.id,
      {
        app_metadata: { salik_role: "STORE_ADMIN" },
      },
    );
    const reset = await double.authClient.auth.resetPasswordForEmail(
      "buyer@example.test",
      {
        redirectTo: "http://localhost:5173/?passwordRecovery=1",
      },
    );
    const signedOut = await double.adminClient.auth.admin.signOut(
      refreshed.data.session!.access_token,
      "local",
    );

    expect(signedIn.error).toBeNull();
    expect(refreshed.data.user?.id).toBe(user.id);
    expect(resolved.data.user?.email).toBe("buyer@example.test");
    expect(listed.data.users).toHaveLength(1);
    expect(updated.data.user).not.toBeNull();
    expect(updated.data.user!.app_metadata.salik_role).toBe("STORE_ADMIN");
    expect(reset.error).toBeNull();
    expect(signedOut.error).toBeNull();
    expect(user).not.toHaveProperty("password");
    expect(JSON.stringify(user)).not.toContain("Password123!");
  });

  it("supports upload, download, remove and one-shot provider failures", async () => {
    const double = createSupabaseDouble();
    const bucket = double.adminClient.storage.from("salik-private");

    const uploaded = await bucket.upload(
      "org/user/proof.txt",
      Buffer.from("proof"),
      {
        contentType: "text/plain",
        upsert: false,
      },
    );
    const downloaded = await bucket.download("org/user/proof.txt");
    const content = Buffer.from(await downloaded.data!.arrayBuffer()).toString(
      "utf8",
    );
    const removed = await bucket.remove(["org/user/proof.txt"]);

    double.failNext("storage.download", new Error("storage unavailable"));
    const failedDownload = await bucket.download("org/user/proof.txt");

    expect(uploaded).toMatchObject({
      data: { path: "org/user/proof.txt" },
      error: null,
    });
    expect(content).toBe("proof");
    expect(removed.error).toBeNull();
    expect(failedDownload.data).toBeNull();
    expect(failedDownload.error?.message).toBe("storage unavailable");
  });

  it("returns provider errors without throwing and never embeds real credentials", async () => {
    const double = createSupabaseDouble();
    double.failNext(
      "auth.signInWithPassword",
      new Error("invalid credentials"),
    );

    const response = await double.authClient.auth.signInWithPassword({
      email: "missing@example.test",
      password: "wrong-password",
    });

    expect(response.data).toEqual({ user: null, session: null });
    expect(response.error?.message).toBe("invalid credentials");
    expect(JSON.stringify(double)).not.toContain("SUPABASE_SECRET_KEY");
  });
});
