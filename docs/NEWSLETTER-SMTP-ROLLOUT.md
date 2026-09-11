# RU/EN newsletter delivery through the server SMTP

This rollout replaces Ghost's publication-wide confirmation UI and Mailgun-only bulk sending with the Lounge application and the already verified Ghost/Brevo SMTP account.

## Behaviour

- `/en/` forms send an English confirmation and subscribe only to `After Login — EN`.
- Other forms send a Russian confirmation and subscribe only to `После логина — RU`.
- A `post.published` webhook sends the matching article version through SMTP.
- A delivery ledger prevents duplicate messages after repeated webhooks.
- Every publication message contains a language-specific unsubscribe link. Opening the link does not unsubscribe; the reader must confirm it.
- Ghost remains the source of truth for members, newsletter membership and suppression state.

## Production rollout

Run each command separately and stop on any error.

```bash
cd /root/gostinaya
git pull --ff-only
npm ci --omit=dev
npm run backup:create
npm run newsletter:smtp
npm run migrate:newsletter-deliveries
npm run ghost:subscription-cta
```

The last three commands are dry-runs. After reviewing their output:

```bash
npm run newsletter:smtp -- --apply
npm run migrate:newsletter-deliveries -- --apply
pm2 restart gostinaya --update-env
pm2 status
curl -fsS https://milenin.pro/health
```

Only after the application endpoint is healthy, update the Ghost theme:

```bash
npm run ghost:subscription-cta -- --apply
```

## Smoke test

1. Submit one unused address from a Russian article and one from an English article.
2. Verify the confirmation email language before clicking.
3. Verify the confirmation page language and return link.
4. In Ghost Admin, verify that each address belongs only to its matching newsletter.
5. Use a test publication or an explicit webhook replay before relying on the next real publication.
6. Verify the article link and the two-step unsubscribe flow.

The SMTP setup script backs up `.env`; the migration backs up SQLite; the theme updater backs up `post.hbs` and rolls it back if Ghost fails to restart.
