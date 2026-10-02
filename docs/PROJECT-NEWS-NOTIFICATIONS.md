# Independent project news notifications — 2 October 2026

The profile has separate RU/EN preferences for project news (`notify_project_news`)
and new Lounge topics (`notify_new_topics`). `notify_email` controls whether the
selected internal events also produce email. Verified, unblocked accounts remain
the only recipients. A subscribed news author receives their own news; authors
of ordinary topics continue to be excluded.

For existing accounts the migration copies the former combined choice to both
categories. It preserves email preferences and does not overwrite later choices
on rerun. New accounts default to both categories disabled.

Deploy before restarting the application:

```bash
cd /root/gostinaya &&
npm run backup:create &&
git pull --ff-only origin feature/article-subscriptions &&
node database/migrate-project-news-preference.js --apply &&
npm test &&
pm2 restart gostinaya
```

The migration first creates a SQLite backup, then adds and initializes the field
in one transaction. Running without `--apply` only reports the planned change.
Existing news are not resent. No mailing is performed by this migration.

Local validation: 136 tests passed, including independent recipient selection,
subscribed author delivery, email off, dry run, backup, preservation of old
choices, new account defaults, and repeat migration after changed preferences.
Production installation and automatic delivery remain to be verified.
