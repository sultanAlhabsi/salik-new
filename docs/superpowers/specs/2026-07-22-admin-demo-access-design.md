# Admin Demo Access Design

## Goal

Restore an Admin demo entry on the shared login screen for local and hosted demos without changing or exposing the private administrator account.

## Design

SALIK will provision a dedicated `demo-admin@salik.om` user with the `SUPER_ADMIN` role and no organization. It will use the same prepared-demo password as the supplier, store, and driver demo identities. The existing private `admin@salik.om` identity remains outside the prepared-demo actor list and its credentials are never reconciled by the hosted-demo bootstrap.

The client adds the dedicated account to `preparedDemoAccounts` and maps its `admin` portal to the existing building icon. The existing demo grid and login flow remain unchanged; selecting the card submits the prepared email and password and opens the existing `AdminPortal` after authentication.

Both data paths create the same identity:

- The destructive local demo seed adds the user alongside the existing local fixtures.
- The non-destructive hosted demo bootstrap creates or reconciles only `demo-admin@salik.om`, while preserving the private administrator and all non-demo records.

## Safety

The demo administrator intentionally has full platform administration access because the hosted deployment is restricted to trusted viewers. Isolation from the private administrator prevents the public demo password from replacing a real operator credential. The hosted bootstrap remains additive and idempotent.

## Testing

Configuration tests assert four prepared demo accounts and retain the assertion that `admin@salik.om` is not a prepared account. Hosted-bootstrap integration tests assert that the dedicated demo administrator is provisioned as `SUPER_ADMIN`, can be reconciled idempotently, and does not alter the private administrator. Existing authentication and UI tests cover portal routing once the identity exists.
