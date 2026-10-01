# Subscription chain repair — 2026-10-01

## Findings and resulting behavior

- Old members subscribed only to `После логина` were excluded from RU/EN delivery. `scripts/migrate-legacy-newsletter.js` previews migration, writes a private member snapshot on apply, verifies RU membership, removes obsolete membership and archives the legacy newsletter. Legacy+EN-only members require review; opted-out and suppressed addresses are never resubscribed. Do not blindly run migration after a previous partial migration without inspecting the preview.
- Publication delivery depended on Lounge discussion tags and publication of both translations. It now dispatches each published post independently to its language on `post-published`. `post-updated` never sends newsletters. Previous paired delivery keys are checked to prevent duplicate delivery after the key transition.
- Failed delivery previously returned HTTP 200. Incomplete publication delivery now fails the webhook with HTTP 500 and logs the result; already sent recipients remain deduplicated on retry. This allows the caller to detect failure; it does not establish that Ghost will automatically retry every failure.
- Unsubscribe now verifies the Ghost result and sends a localized confirmation email. SMTP receipt failure cannot undo opt-out; it is logged and exposed as `receiptSent: false`. There is no durable automatic retry queue for welcome/receipt email yet.
- Confirmation and unsubscribe tokens are atomically consumed in SQLite. Concurrent use cannot send duplicate welcome/receipt messages. Ghost API failure restores the token for retry. Welcome delivery failure does not invalidate an already confirmed subscription and is logged as `welcomeSent: false`.
- Existing confirmation and welcome wording is preserved for separate editorial review. Article emails still contain logo, title, article link and unsubscribe link, without full article text.

## Local validation

Node 22.16.0: `npm test` — 123 passed, 0 failed. RU/EN lifecycle tests cover confirmation, welcome, publication, deduplication, opt-out, absence of subsequent deliveries and resubscription. SQLite tests cover concurrent token consumption, failed-delivery claims and compatibility with old delivery keys. These tests use fake Ghost and SMTP responses; they do not prove production delivery.

## Production verification — pending

1. Check deployment commit, working tree, schema and back up SQLite + Ghost member settings before applying changes. Confirm `/gostinaya/webhooks/ghost/post-published` is registered for `post.published` with the correct secret. Do not print the secret in logs or screenshots.
2. Run `node scripts/check-newsletter-chain.js milen.petr@gmail.com` to inspect current membership and delivery history (read only).
3. Run `node scripts/migrate-legacy-newsletter.js` and inspect the dry-run plan. Apply with `--apply` only after reviewing the plan and the relevant member histories. Script saves a backup and verifies changes. It sends no email.
4. After deployment run `npm test`, restart the application with `pm2 restart gostinaya --update-env` and check `/health`.
5. Use one owner-controlled test address for each language. Confirm initial signup email, token expiry and welcome, then verify Ghost channel membership. Repeat confirmation; no extra welcome should arrive.
6. Publish a new test post in each language independently. Verify delivery logs and actual inbox contents. Repeat the publication event; no duplicate should arrive. Editing an old post should not send a publication email. Use controlled test content; do not unpublish/republish a real article to trigger a test.
7. Open the unsubscribe link: subscription must remain active until the POST confirmation. Confirm; check language-specific membership removal, confirmation receipt and preservation of other language and Lounge membership. Publish another controlled test post: no message to the opted-out language. Resubscribe and confirm again.
8. Optional recovery of one missed article: `node scripts/deliver-newsletter-post.js POST_ID milen.petr@gmail.com` is dry-run; `--apply` sends only to that actively subscribed address, with normal duplicate protection. Obtain the exact POST_ID from Ghost; do not infer it from a slug.
9. Inspect SMTP provider delivery/bounce status separately: `sent` means SMTP handoff, not guaranteed inbox delivery. Never reset `pending` delivery rows blindly; inspect SMTP history first to avoid duplicates.

Status: code prepared and locally tested; production deployment, member migration and live email cycle have not been performed by this change.
