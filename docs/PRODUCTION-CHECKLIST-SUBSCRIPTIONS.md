# Production checklist: подписка под статьями

- [ ] Выполнить `npm run ghost:newsletters` без `--apply` и сохранить вывод.
- [ ] Убедиться, что создаются/существуют `После логина — RU` и `After Login — EN`.
- [ ] Выполнить `npm run ghost:newsletters -- --apply`.
- [ ] Выполнить `npm run ghost:subscription-cta` без `--apply`.
- [ ] Проверить, что текущий `after-login-invitation` найден ровно один раз.
- [ ] Выполнить `npm run ghost:subscription-cta -- --apply`.
- [ ] Открыть одну RU и одну EN статью на desktop.
- [ ] Открыть одну RU и одну EN статью на mobile.
- [ ] Проверить сохранность текста Гостиной и перехода на `/gostinaya/article/{{id}}`.
- [ ] Выполнить тестовую RU-подписку на отдельный e-mail.
- [ ] Выполнить тестовую EN-подписку на другой e-mail.
- [ ] Проверить, что Members подписаны на разные newsletters.
- [ ] Проверить фактический язык confirmation email на обеих формах.
- [ ] Выполнить `npm run ghost:contact-email` без `--apply` и изучить полный список совпадений.
- [ ] Выполнить `npm run ghost:contact-email -- --apply` только если список ожидаемый.
- [ ] Проверить `mailto:milen.petr@gmail.com` в статье и на статических страницах.
- [ ] Проверить Ghost после рестарта и отсутствие новых критических ошибок.
