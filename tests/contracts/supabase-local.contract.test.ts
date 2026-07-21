import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const contractEnvironment = {
  enabled: process.env.SUPABASE_CONTRACT_TEST === "true",
  url: process.env.SUPABASE_TEST_URL,
  publishableKey: process.env.SUPABASE_TEST_PUBLISHABLE_KEY,
  secretKey: process.env.SUPABASE_TEST_SECRET_KEY,
  email: process.env.SUPABASE_TEST_EMAIL,
  password: process.env.SUPABASE_TEST_PASSWORD,
  bucket: process.env.SUPABASE_TEST_BUCKET ?? "salik-private",
};
const hasContractEnvironment =
  contractEnvironment.enabled &&
  Boolean(
    contractEnvironment.url &&
    contractEnvironment.publishableKey &&
    contractEnvironment.secretKey &&
    contractEnvironment.email &&
    contractEnvironment.password,
  );

describe.skipIf(!hasContractEnvironment)(
  "Supabase local Auth and Storage contract",
  () => {
    it("signs in, refreshes, resolves the user, and round-trips a private object", async () => {
      const options = {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      };
      const authClient = createClient(
        contractEnvironment.url!,
        contractEnvironment.publishableKey!,
        options,
      );
      const adminClient = createClient(
        contractEnvironment.url!,
        contractEnvironment.secretKey!,
        options,
      );
      const objectPath = `contract/${randomUUID()}.txt`;

      const signedIn = await authClient.auth.signInWithPassword({
        email: contractEnvironment.email!,
        password: contractEnvironment.password!,
      });
      expect(signedIn.error).toBeNull();
      expect(signedIn.data.session).not.toBeNull();

      const refreshed = await authClient.auth.refreshSession({
        refresh_token: signedIn.data.session!.refresh_token,
      });
      expect(refreshed.error).toBeNull();

      const resolved = await adminClient.auth.getUser(
        refreshed.data.session!.access_token,
      );
      expect(resolved.data.user?.id).toBe(signedIn.data.user?.id);

      try {
        const uploaded = await adminClient.storage
          .from(contractEnvironment.bucket)
          .upload(objectPath, Buffer.from("salik-contract"), {
            contentType: "text/plain",
            upsert: false,
          });
        expect(uploaded.error).toBeNull();

        const downloaded = await adminClient.storage
          .from(contractEnvironment.bucket)
          .download(objectPath);
        expect(downloaded.error).toBeNull();
        expect(
          Buffer.from(await downloaded.data!.arrayBuffer()).toString("utf8"),
        ).toBe("salik-contract");
      } finally {
        const removed = await adminClient.storage
          .from(contractEnvironment.bucket)
          .remove([objectPath]);
        expect(removed.error).toBeNull();
        await authClient.auth.signOut({ scope: "local" });
      }
    });
  },
);
