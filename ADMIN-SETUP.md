# Exceptionally Floral studio editor

The public site stays on GitHub Pages at **exceptionallyfloral.com**. The studio lives at **/admin/**. Supabase supplies the login, database and private photo storage. No GitHub token or server secret is needed in the browser. Until configured, the original 17 pieces render from `data/content.json`; sign-in is disabled.

## One-time setup for Randy

1. Create a Supabase project in an account you control. Store the database password in your password manager, never in this repository. Review the plan's storage, backup and inactivity limits before going live.
2. In its SQL editor, run `supabase/schema.sql`, then `supabase/seed.sql`. These target a **new project**. Do not rerun the schema against existing tables.
3. Under Authentication settings, **disable public sign-ups**. Create confirmed email/password users for Randy and Bridget through the Supabase dashboard. Use unique strong passwords. No signup screen is shipped.
4. Copy each user's UUID from Authentication → Users and run this in the SQL editor, replacing the two placeholders:

   ```sql
   insert into private.editors(user_id) values
     ('RANDY-USER-UUID'::uuid), ('BRIDGET-USER-UUID'::uuid);
   ```

   A valid login alone does not grant editing rights. Only this private allowlist does. Remove an editor with `delete from private.editors where user_id = 'UUID'::uuid;`.
5. Set the Auth Site URL to `https://exceptionallyfloral.com` and configure a trusted SMTP sender if using email invitations/reset emails. The initial editor uses passwords; account owners handle password resets in Supabase. Sessions are held in memory only and require a new login after refreshing/expiration. Use **Sign in again** to reauthenticate without losing the open draft.
6. Put only the **project URL** and **publishable key** in `site-config.js`. Randy can provide those two public values for the final configuration. Never provide or commit a secret key, `service_role` key, database password or personal GitHub token. This implementation accepts the standard `https://PROJECT.supabase.co` URL.
7. Complete the live security checks below using a staging deployment, then merge the reviewed change into the branch used by GitHub Pages. Keep `CNAME`, Pages settings and DNS unchanged. Confirm `/admin/` and the public site over HTTPS on the custom domain.

The account setup and final live connection cannot be completed without Randy's Supabase project. The code can be reviewed and tested locally before those public settings are available.

## Daily use

Sign in at `/admin/`. Use **Add collection**, its name/description/visibility fields and arrows to organize collections. Choose original, even, or large gallery layout per collection. New collections and pieces start hidden. Upload a JPG/PNG/WebP (up to 15 MB); the browser removes embedded metadata by re-encoding and resizes to at most 2000 pixels, with a 5 MB storage limit. Use the piece's dropdown to move it to another collection, and arrows to reorder it.

Each piece has an immutable ID and these statuses:

| Status | Public result |
| --- | --- |
| Available | Normal gallery photo |
| Sold | Photo remains with a gold/wine SOLD label |
| Made to Order | Caption says Made to Order |
| Hidden | Removed from public content and gallery |

Inventory type records whether a piece is one-off or made-to-order for future commerce. It is distinct from its display status. Adjust both when converting a one-off design to a repeatable product. Hiding a collection hides all its pieces. The public wording panel edits selected introductions and gallery wording as plain text; policy, links, analytics and other page structure remain in code.

**Save draft → Preview → Done reviewing → Publish previewed draft.** Preview has phone/full-width controls and renders the actual site. Editing after preview requires a fresh preview. Publishing changes the public snapshot atomically. Another editor's newer save causes a conflict instead of being overwritten: copy your changes before reloading. Drafts saved on the server survive refresh; unsaved edits do not. There is no automatic public fallback to old stock if the configured service is unavailable.

## Security and data model

- Public clients can read only `site_public` and photos referenced by its filtered snapshot. Drafts and hidden records never appear in that snapshot. Storage is **private**, not a public bucket. Published photos are fetched with the public project key and storage RLS. Previously viewed/downloaded images cannot be recalled from visitors' devices.
- All writes go through authenticated database functions checking the private editor allowlist. RLS and grants deny direct draft/public writes, even for an editor. The publish function checks the current revision and required uploaded photos; it filters hidden items and writes an audit snapshot in the same transaction.
- Upload paths are immutable UUIDs; users cannot overwrite/delete published photos. Unused drafts/uploads remain private. Periodically review storage usage and manually remove only photos absent from draft, publication and retained history.
- The admin has a restrictive CSP, uses plain-text DOM operations, keeps sessions out of persistent browser storage, and has no analytics. Preview messages validate their origin and sending window. Supabase is responsible for password storage and authentication throttling. Protect the owner dashboard account with MFA.
- Publication history is in `private.publish_history`, visible only to the project owner. To recover an old draft, copy its content into `site_draft` via the SQL editor and **increment revision**; then sign in, review and republish. Preserve backups before changing production data.
- Public site analytics ID, policies, Facebook links, desktop/portrait background assets, lightbox, CNAME and Pages hosting are preserved. Uploaded photos load asynchronously; Google Analytics continues on public pages, including the preview iframe.

Official references: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage access controls](https://supabase.com/docs/guides/storage/security/access-control), [Password authentication](https://supabase.com/docs/guides/auth/passwords).

## Required staging checks before activation

Automated browser tests use a simulated service. They **do not prove hosted database authorization**. Run `supabase/security-tests.sql` in the staging project's SQL editor after the schema and seed. It rolls its test data back. Also verify through real HTTP/browser sessions:

- Signed-out and non-allowlisted users cannot read drafts, write content, publish, or upload; public sign-up is disabled.
- Both approved accounts can sign in, save drafts, upload and preview; concurrent saves/publishes report conflicts.
- A new draft photo cannot be downloaded anonymously. After publishing its visible piece it loads publicly; hiding and publishing removes anonymous access.
- Direct table writes, storage overwrites/deletes and malformed/oversized content are rejected.
- Expired/revoked sessions do not lose unsaved edits; sign-in again resumes them. Failed upload/save/publish leaves the current public snapshot unchanged.
- Test phone (375/390 px) and desktop, SOLD label, lightbox, navigation, Facebook, policies, analytics and the custom domain. Verify no unexpected browser/network errors.

## Future sales and shipping

Checkout is **not enabled** by this change. Before accepting orders, add separate authoritative inventory, orders, order items, payment events, shipping addresses and fulfillment records. Never include customer/order data in the public content JSON. Reuse the existing immutable piece IDs; keep sold pieces in the portfolio.

Use a server-side payment integration (for example a hosted checkout). Verify webhook signatures, deduplicate provider event IDs and handle retries. The browser's success URL must never mark a piece paid or sold. For a one-off piece, reserve inventory atomically before checkout, enforce a single active reservation, expire abandoned reservations and reconcile delayed payment events. On confirmed payment, atomically mark authoritative inventory Sold and update the public projection. Made-to-order items use separate fulfillment rules and do not automatically sell out.

**Before checkout goes live**, change publishing to join authoritative inventory by piece ID: an older saved draft must never reset a paid item to Available. Inventory state wins over editorial status. The current draft/public JSON model is intentionally editorial; there is no payment webhook in this version. Shipping labels, tracking, taxes, prices/currency, rates and customer emails belong in that future server-side order flow. Preserve the existing order notice and policy acknowledgement at checkout, recording the accepted policy version with each order.

## Development

No build is needed for GitHub Pages. Serve the repository root with a static HTTP server (ES modules require HTTP). `npm test` runs content/invariant checks using Node's built-in test runner. For browser tests install Playwright locally (`npm install --no-save playwright` and `npx playwright install chromium`), then run `npm run test:browser`. Set `BROWSER_CHANNEL=msedge` to use installed Edge. Set `TEST_OUTPUT_DIR` to save review screenshots. No test credentials are real.
