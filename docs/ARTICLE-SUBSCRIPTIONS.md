# Подписка на новые публикации / Article subscriptions

## Цель

Под каждой статьёй проекта показывается единый блок в порядке:

1. подписка на новые публикации;
2. существующее приглашение в Гостиную;
3. связь с автором.

Русская статья подписывает на `После логина — RU`, английская — на `After Login — EN`.
Контактный адрес проекта: `milen.petr@gmail.com`.

## Что подготовлено

- `scripts/setup-ghost-newsletters.js` — проверяет наличие двух newsletters и при `--apply` создаёт отсутствующие;
- `scripts/update-ghost-subscription-cta.js` — заменяет текущий CTA в `post.hbs`, сначала делает backup темы, затем перезапускает Ghost и проверяет состояние контейнера;
- `scripts/update-ghost-contact-email.js` — ищет старый `pm@milenin.pro` в опубликованных posts/pages и текстовых файлах темы, делает backup Ghost DB и изменяемых данных, затем заменяет адрес и проверяет результат.

Все три сценария по умолчанию работают как dry run. Запись выполняется только с `--apply`.

## Порядок production rollout

```bash
cd /root/gostinaya
git fetch origin
git checkout feature/article-subscriptions

npm run ghost:newsletters
npm run ghost:subscription-cta
npm run ghost:contact-email
```

Сначала изучить вывод dry run. Если инвентарь соответствует ожиданию:

```bash
npm run ghost:newsletters -- --apply
npm run ghost:subscription-cta -- --apply
npm run ghost:contact-email -- --apply
```

После этого проверить минимум одну RU и одну EN статью на desktop и mobile, выполнить тестовую подписку на разные e-mail и убедиться, что подписчики попали в разные newsletters.

## Важный нюанс Ghost

Разделение самих newsletters по языкам поддерживается штатно через `data-members-newsletter`.
Системные письма Ghost (включая письмо подтверждения/sign-in) локализуются на уровне языка публикации Ghost, а не отдельно для каждой формы/страницы. Поэтому перед production нужно отдельно проверить фактический язык confirmation email на RU- и EN-странице. Если Ghost отправляет один язык для обеих форм, для строго раздельных RU/EN confirmation emails потребуется отдельный кастомный verification flow; не маскировать это ограничение настройками темы.
