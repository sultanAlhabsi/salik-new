# External integrations

SALIK keeps external providers behind replaceable route/service boundaries.

## Payment provider

The local adapter initiates a `PROCESSING` payment attempt and returns a demo payment URL. Provider confirmation arrives only through the authenticated webhook. It never stores card numbers or browser-return payloads as proof of payment.

For production, replace the local initiation response and shared-secret webhook check with the selected Omani acquirer's SDK and signature verification. Preserve SALIK's idempotency key, provider reference, amount, state-machine validation, and audit writes.

## Password reset delivery

When Supabase is configured, reset requests use Supabase Auth email recovery. The browser returns the recovery access token to SALIK's completion endpoint, which validates it with Supabase before changing the password. SALIK does not log or return recovery tokens from the request endpoint. The local hashed 30-minute token flow remains available only when `SALIK_SUPABASE_DISABLED=true`.

## File storage

Configured environments write files to the private Supabase Storage bucket `salik-private` under `<organization>/<auth-user>/<random-token>-<safe-filename>`. Metadata remains in Prisma and every upload/download passes through SALIK entity authorization. The bucket rejects public URLs and applies RLS folder policies for authenticated direct access. Local filesystem storage is used only when Supabase is explicitly disabled.

## Notifications

The first release uses durable in-app notifications. Email, SMS, or push delivery should be implemented as asynchronous adapters so provider failure never rolls back the underlying order, payment, inventory, or delivery transaction.
