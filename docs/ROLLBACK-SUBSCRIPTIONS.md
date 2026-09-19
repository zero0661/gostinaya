# Откат изменений подписки

Все production-скрипты этой ветки работают в dry-run без `--apply`.

При применении:

- `update-ghost-subscription-cta.js` сохраняет исходный `post.hbs` в `/root/ghost-theme-backups/subscription-cta-<timestamp>/` и автоматически возвращает файл при ошибке после записи;
- `update-ghost-contact-email.js` сохраняет SQL dump Ghost, исходные Lexical-данные изменяемых публикаций/страниц и копии изменяемых файлов темы в `/root/ghost-theme-backups/contact-email-<timestamp>/`;
- `setup-ghost-newsletters.js` только создаёт отсутствующие newsletters и не подписывает существующих Members автоматически (`opt_in_existing` не используется).

Перед `--apply` обязательно сохранить вывод dry run. После применения проверить RU/EN статью и тестовые подписки.
