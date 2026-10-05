# Контроль релизов и advisories Ghost

Подтверждено 5 октября 2026 года, 09:43–09:44 МСК: установка, успешный запуск под systemd и получение владельцем установочного письма. Работающий Ghost 6.67.0; официальный последний стабильный релиз при проверке v6.67.0. Каталог содержал 80 advisories. Следующий запуск: 6 октября, 06:00 МСК.

## Расписание и файлы

- Ежедневно 06:00 МСК: `ghost-release-watch.timer`, calendar `*-*-* 03:00:00 UTC`, Persistent=true.
- Сервис: `ghost-release-watch.service`, root, WorkingDirectory=/root/gostinaya, timeout 10 минут.
- Скрипт: `/usr/local/lib/ghost-release-watch.py`.
- Закрытые состояние/lock: `/var/lib/ghost-release-watch`.
- Код: `scripts/ghost-release-watch.py`, установленный commit `6b464c6324557298d0d2cb778232d461ab518135`.
- SHA256: `df4e7c590ee528fad2b3e05b250e96078c703762a6f7d9db03378c66960a981e`.
- Зависимость: установленный ghost-security-watch.py, его config и SMTP Гостиной; секреты не копируются в Git.

Источники: https://api.github.com/repos/TryGhost/Ghost/releases/latest и https://api.github.com/repos/TryGhost/Ghost/security-advisories?state=published&per_page=100 (пагинация). Версия production читается из package.json работающего контейнера ghost-ghost-1.

## Поведение

Уведомление отправляется при новом более свежем стабильном релизе либо новом/изменённом advisory. Включены описание, affected ranges и patched versions при наличии. Применимость advisory к установленной версии проверяется человеком; первоначальное сохранение каталога не является аудитом применимости всех исторических advisories. Уведомления о повторяющейся ошибке проверки ограничены одним в сутки; восстановление проверки также сообщается. SMTP-сбой не помечает событие доставленным.

Скрипт не устанавливает обновления. Получив сообщение, проверить официальный источник, affected range и исправленную версию; подготовить backup, тестовую миграцию и плановое обновление. После обновления проверить сайт, Гостиную и штатный контроль изменений. Не принимать новый baseline до проверки ожидаемых изменений.

## Проверка без изменения сайта

На VPS:

```bash
systemctl list-timers --all ghost-release-watch.timer --no-pager
journalctl -u ghost-release-watch.service -n 20 --no-pager
systemctl start ghost-release-watch.service
```

Успешная проверка: GHOST_RELEASE_WATCH_OK. Установочное письмо доставлено владельцу; следующий отдельный ежедневный цикл на момент фиксации ещё не наступил.
