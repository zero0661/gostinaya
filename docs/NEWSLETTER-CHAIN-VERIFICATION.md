# Subscription chain repair — 2026-10-01

## Findings and resulting behavior

- Old members subscribed only to `После логина` were excluded from RU/EN delivery. `scripts/migrate-legacy-newsletter.js` previews migration, writes a private member snapshot on apply, verifies RU membership, removes obsolete membership and archives the legacy newsletter. Legacy+EN-only members require review; opted-out and suppressed addresses are never resubscribed. Do not blindly run migration after a previous partial migration without inspecting the preview.
- Publication delivery depended on Lounge discussion tags and publication of both translations. It now dispatches each published post independently to its language on `post-published`. `post-updated` never sends newsletters. Previous paired delivery keys are checked to prevent duplicate delivery after the key transition.
- Failed delivery previously returned HTTP 200. Incomplete publication delivery now fails the webhook with HTTP 500 and logs the result; already sent recipients remain deduplicated on retry. This allows the caller to detect failure; it does not establish that Ghost will automatically retry every failure.
- Unsubscribe now verifies the Ghost result and sends a localized confirmation email. SMTP receipt failure cannot undo opt-out; it is logged and exposed as `receiptSent: false`. There is no durable automatic retry queue for welcome/receipt email yet.
- Confirmation and unsubscribe tokens are atomically consumed in SQLite. Concurrent use cannot send duplicate welcome/receipt messages. Ghost API failure restores the token for retry. Welcome delivery failure does not invalidate an already confirmed subscription and is logged as `welcomeSent: false`.
- Existing confirmation and welcome wording is preserved for separate editorial review. Article emails contain the logo, cover when present, title, a short teaser, article button and unsubscribe link. Teasers prefer the author’s custom excerpt, then metadata/excerpt, then the beginning of the article (up to 500 characters), separately for RU and EN. The full article remains on the site.

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

## Production evidence — 2026-10-02

Lifecycle repair PR #19 was merged and installed; 123 tests passed on the server. After restart, the repeated health check succeeded and diagnostics ran. The owner confirmed receiving the RU confirmation email, successful confirmation on the site and the welcome email. Recovery delivery for RU post `6abe5c772b46fe0001bb2eac` to `milen.petr@gmail.com` reported one sent, zero failures; the inbox screenshot confirms arrival. Automatic publication triggering, duplicate suppression in production, opt-out/receipt, resubscription and the EN cycle still require live verification. Legacy migration has not been applied.

The article card change is locally validated by 125 passing tests; installation and inspection of the revised email remain pending.

## Production verification on 2026-10-02

- RU confirmation and welcome were received; unsubscribe page and receipt succeeded. Ghost reported RU membership inactive after opt-out. Resubscription confirmation and welcome were then received.
- Legacy migration dry-run found no members to migrate or review. Apply saved a member backup and archived the obsolete newsletter.
- `post.published` is registered in Gostinaya 2. Publishing a new test post automatically delivered the article card to both RU member addresses; the user reported no new emails after editing the published post.
- A separate Lounge publication notification was received by the author account. Lounge article emails now use the shared article-card template, localized preview and cover, and profile notification settings.
- English signup/publication/opt-out production verification and removal of test content remain pending. The approved new welcome text is not yet installed.

## Lounge discussion button

The Lounge publication email's “Read and discuss” / “Прочитать и обсудить” button now links to `/gostinaya/topic/:topicId`, matching the internal publication notification. The footer still opens profile notification settings. RU/EN preview and cover selection remains unchanged. All 126 tests pass locally; production installation and clicking the revised button remain pending.
