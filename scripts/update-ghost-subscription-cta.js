#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const APPLY = process.argv.includes('--apply');
const GHOST_CONTAINER = 'ghost-ghost-1';
const THEME_FILE = '/var/lib/docker/volumes/ghost_ghost_content/_data/themes/liebling/post.hbs';
const BACKUP_ROOT = '/root/ghost-theme-backups';
const CONTACT_EMAIL = 'milen.petr@gmail.com';
const SIGNUP_ENDPOINT = '/gostinaya/api/newsletter/subscribe';

const NEW_TEMPLATE = String.raw`            <section class="after-login-invitation">
                {{#has tag="English"}}
                    <div class="after-login-invitation__part after-login-invitation__part--subscribe">
                        <h2>Stay Updated</h2>
                        <p>New essays from <em>After Login</em>, about once every two weeks. New publications only. No promotional mail.</p>
                        <form class="after-login-subscribe" action="${SIGNUP_ENDPOINT}" method="post" data-language="en">
                            <input name="language" type="hidden" value="en">
                            <input name="returnTo" type="hidden" value="">
                            <div class="after-login-subscribe__row">
                                <label class="after-login-subscribe__label" for="after-login-email-en">Email</label>
                                <input id="after-login-email-en" class="after-login-subscribe__input" name="email" type="email" required autocomplete="email" placeholder="your@email.com">
                                <button class="after-login-invitation__button after-login-invitation__button--primary" type="submit">Subscribe</button>
                            </div>
                            <p class="after-login-subscribe__state after-login-subscribe__state--loading">Sending…</p>
                            <p class="after-login-subscribe__state after-login-subscribe__state--success">Check your inbox and confirm your subscription.</p>
                            <p class="after-login-subscribe__state after-login-subscribe__state--error">Could not send the confirmation email. Please try again.</p>
                        </form>
                    </div>

                    <div class="after-login-invitation__divider" aria-hidden="true"></div>

                    <div class="after-login-invitation__part">
                        <h2>The Conversation Continues in the Lounge</h2>
                        <p>
                            The article ends here, but the conversation doesn’t. In the project Lounge,
                            you can discuss what you’ve read, disagree with the author, reply to other
                            readers, or start a topic of your own.
                        </p>
                        <div class="after-login-invitation__actions">
                            <a class="after-login-invitation__button after-login-invitation__button--primary"
                               href="https://milenin.pro/gostinaya/article/{{id}}">Discuss This Article</a>
                        </div>
                    </div>

                    <div class="after-login-invitation__divider" aria-hidden="true"></div>

                    <div class="after-login-invitation__part after-login-invitation__part--contact">
                        <h2>Contact the Author</h2>
                        <p>Questions, criticism, ideas or collaboration.</p>
                        <div class="after-login-invitation__actions">
                            <a class="after-login-invitation__button after-login-invitation__button--secondary"
                               href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>
                        </div>
                    </div>
                    <p class="after-login-invitation__motto"><em>After Login, everything is just beginning.</em></p>
                {{else}}
                    <div class="after-login-invitation__part after-login-invitation__part--subscribe">
                        <h2>Не пропустить новые публикации</h2>
                        <p>Новые статьи «После логина» — примерно раз в две недели. Только новые материалы, без рекламной рассылки.</p>
                        <form class="after-login-subscribe" action="${SIGNUP_ENDPOINT}" method="post" data-language="ru">
                            <input name="language" type="hidden" value="ru">
                            <input name="returnTo" type="hidden" value="">
                            <div class="after-login-subscribe__row">
                                <label class="after-login-subscribe__label" for="after-login-email-ru">E-mail</label>
                                <input id="after-login-email-ru" class="after-login-subscribe__input" name="email" type="email" required autocomplete="email" placeholder="ваш e-mail">
                                <button class="after-login-invitation__button after-login-invitation__button--primary" type="submit">Подписаться</button>
                            </div>
                            <p class="after-login-subscribe__state after-login-subscribe__state--loading">Отправляем…</p>
                            <p class="after-login-subscribe__state after-login-subscribe__state--success">Проверьте почту и подтвердите подписку.</p>
                            <p class="after-login-subscribe__state after-login-subscribe__state--error">Не удалось отправить письмо. Попробуйте ещё раз.</p>
                        </form>
                    </div>

                    <div class="after-login-invitation__divider" aria-hidden="true"></div>

                    <div class="after-login-invitation__part">
                        <h2>Разговор продолжается в Гостиной</h2>
                        <p>
                            Статья заканчивается здесь, но разговор — нет. В Гостиной проекта можно
                            обсудить прочитанное, поспорить с автором, ответить другим читателям
                            или начать собственную тему.
                        </p>
                        <div class="after-login-invitation__actions">
                            <a class="after-login-invitation__button after-login-invitation__button--primary"
                               href="https://milenin.pro/gostinaya/article/{{id}}">Обсудить статью</a>
                        </div>
                    </div>

                    <div class="after-login-invitation__divider" aria-hidden="true"></div>

                    <div class="after-login-invitation__part after-login-invitation__part--contact">
                        <h2>Написать автору</h2>
                        <p>Вопрос, замечание, критика, идея или предложение о сотрудничестве.</p>
                        <div class="after-login-invitation__actions">
                            <a class="after-login-invitation__button after-login-invitation__button--secondary"
                               href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>
                        </div>
                    </div>
                    <p class="after-login-invitation__motto"><em>После логина всё только начинается.</em></p>
                {{/has}}

                <script>
                    (() => {
                        function showNewsletterToast(message) {
                            const previous = document.querySelector('.after-login-newsletter-toast');
                            if (previous) previous.remove();

                            const toast = document.createElement('div');
                            toast.className = 'after-login-newsletter-toast';
                            toast.setAttribute('role', 'status');
                            toast.setAttribute('aria-live', 'polite');

                            const mark = document.createElement('span');
                            mark.className = 'after-login-newsletter-toast__mark';
                            mark.setAttribute('aria-hidden', 'true');
                            mark.textContent = '✓';

                            const text = document.createElement('span');
                            text.className = 'after-login-newsletter-toast__text';
                            text.textContent = message;

                            const close = document.createElement('button');
                            close.className = 'after-login-newsletter-toast__close';
                            close.type = 'button';
                            close.setAttribute('aria-label', 'Close');
                            close.textContent = '×';

                            const dismiss = () => {
                                toast.classList.remove('visible');
                                window.setTimeout(() => toast.remove(), 220);
                            };

                            close.addEventListener('click', dismiss);
                            toast.append(mark, text, close);
                            document.body.appendChild(toast);
                            window.requestAnimationFrame(() => toast.classList.add('visible'));
                            window.setTimeout(dismiss, 8000);
                        }

                        document.querySelectorAll('.after-login-subscribe').forEach((form) => {
                            const returnTo = form.querySelector('[name="returnTo"]');
                            if (returnTo) returnTo.value = window.location.href;
                            form.addEventListener('submit', async (event) => {
                                event.preventDefault();
                                const button = form.querySelector('button[type="submit"]');
                                const errorState = form.querySelector('.after-login-subscribe__state--error');
                                form.classList.remove('success', 'error');
                                form.classList.add('loading');
                                if (button) button.disabled = true;
                                try {
                                    const body = new URLSearchParams(new FormData(form));
                                    body.set('language', form.dataset.language === 'en' ? 'en' : 'ru');
                                    body.set('returnTo', window.location.href);
                                    const response = await fetch(form.action, {
                                        method: 'POST',
                                        headers: { 'Accept': 'application/json' },
                                        body
                                    });
                                    if (!response.ok) throw new Error('signup failed');
                                    const result = await response.json();
                                    form.classList.remove('loading');
                                    if (result.status === 'already-subscribed') {
                                        showNewsletterToast(form.dataset.language === 'en'
                                            ? 'You’re already subscribed.'
                                            : 'Вы уже подписаны.');
                                    } else {
                                        form.classList.add('success');
                                    }
                                } catch (error) {
                                    form.classList.remove('loading');
                                    form.classList.add('error');
                                    if (errorState) errorState.textContent = form.dataset.language === 'en'
                                        ? 'Could not send the confirmation email. Please try again.'
                                        : 'Не удалось отправить письмо. Попробуйте ещё раз.';
                                } finally {
                                    if (button) button.disabled = false;
                                }
                            });
                        });
                        const pageUrl = new URL(window.location.href);
                        if (pageUrl.searchParams.get('newsletter') === 'confirmed') {
                            const form = document.querySelector('.after-login-subscribe');
                            if (form) {
                                showNewsletterToast(form.dataset.language === 'en'
                                    ? 'Subscription confirmed. Thank you.'
                                    : 'Подписка подтверждена. Спасибо.');
                            }
                            pageUrl.searchParams.delete('newsletter');
                            window.history.replaceState({}, '', pageUrl.pathname + pageUrl.search + pageUrl.hash);
                        }
                    })();
                </script>

                <style class="after-login-invitation__styles">
                    .after-login-invitation {
                        margin: 3.5rem 0 3rem;
                        padding: clamp(1.6rem, 4vw, 2.6rem);
                        color: #f4f0e8;
                        text-align: center;
                        background:
                            radial-gradient(circle at top left, rgba(169, 117, 255, .17), transparent 42%),
                            linear-gradient(145deg, #19171f 0%, #111116 100%);
                        border: 1px solid rgba(255, 255, 255, .1);
                        border-radius: 22px;
                        box-shadow: 0 20px 55px rgba(0, 0, 0, .22);
                    }

                    .after-login-invitation__part h2 {
                        margin: 0 0 1rem;
                        color: #fff;
                        font-size: clamp(1.45rem, 3vw, 2rem);
                        line-height: 1.25;
                    }

                    .after-login-invitation__part > p {
                        max-width: 46rem;
                        margin: 0 auto;
                        color: rgba(244, 240, 232, .76);
                        font-size: 1rem;
                        line-height: 1.75;
                    }

                    .after-login-invitation__divider {
                        height: 1px;
                        margin: 2.1rem auto;
                        max-width: 44rem;
                        background: rgba(255, 255, 255, .1);
                    }

                    .after-login-invitation__actions {
                        display: flex;
                        justify-content: center;
                        flex-wrap: wrap;
                        gap: .8rem;
                        margin: 1.45rem 0 0;
                    }

                    .after-login-invitation__button {
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        min-height: 3rem;
                        padding: .78rem 1.3rem;
                        border-radius: 999px;
                        font: inherit;
                        font-weight: 700;
                        line-height: 1.2;
                        text-decoration: none;
                        cursor: pointer;
                        transition: transform .18s ease, background .18s ease, border-color .18s ease;
                    }

                    .after-login-invitation__button:hover {
                        transform: translateY(-2px);
                        text-decoration: none;
                    }

                    .after-login-invitation__button--primary {
                        color: #161219 !important;
                        background: linear-gradient(135deg, #f2d9a7, #c8a5ff);
                        border: 1px solid transparent;
                    }

                    .after-login-invitation__button--secondary {
                        color: #f4f0e8;
                        background: rgba(255, 255, 255, .045);
                        border: 1px solid rgba(255, 255, 255, .18);
                    }

                    .after-login-subscribe {
                        max-width: 44rem;
                        margin: 1.45rem auto 0;
                    }

                    .after-login-subscribe__row {
                        display: grid;
                        grid-template-columns: auto minmax(12rem, 1fr) auto;
                        align-items: center;
                        gap: .75rem;
                    }

                    .after-login-subscribe__label {
                        color: rgba(244, 240, 232, .72);
                        font-size: .95rem;
                    }

                    .after-login-subscribe__input {
                        width: 100%;
                        min-height: 3rem;
                        padding: .72rem 1rem;
                        color: #f4f0e8;
                        background: rgba(255, 255, 255, .055);
                        border: 1px solid rgba(255, 255, 255, .18);
                        border-radius: 999px;
                        outline: none;
                    }

                    .after-login-subscribe__input:focus {
                        border-color: rgba(200, 165, 255, .7);
                        box-shadow: 0 0 0 3px rgba(200, 165, 255, .12);
                    }

                    .after-login-subscribe__state {
                        display: none;
                        margin: .8rem auto 0;
                        color: rgba(244, 240, 232, .72);
                        font-size: .92rem;
                    }

                    .after-login-subscribe.loading .after-login-subscribe__state--loading,
                    .after-login-subscribe.success .after-login-subscribe__state--success,
                    .after-login-subscribe.error .after-login-subscribe__state--error {
                        display: block;
                    }

                    .after-login-subscribe.error .after-login-subscribe__state--error {
                        color: #ffc6c6;
                    }

                    .after-login-invitation__motto {
                        margin: 2.15rem 0 0;
                        color: rgba(244, 240, 232, .58);
                        font-family: Georgia, serif;
                        font-size: .98rem;
                    }

                    .after-login-newsletter-toast {
                        position: fixed;
                        top: 1.25rem;
                        right: 1.25rem;
                        z-index: 2147483646;
                        display: grid;
                        grid-template-columns: auto minmax(0, 1fr) auto;
                        align-items: center;
                        gap: .75rem;
                        width: min(26rem, calc(100vw - 2.5rem));
                        padding: 1rem 1.05rem;
                        color: #f7f4ed;
                        text-align: left;
                        background: rgba(24, 22, 29, .96);
                        border: 1px solid rgba(200, 165, 255, .45);
                        border-radius: 14px;
                        box-shadow: 0 18px 45px rgba(0, 0, 0, .36);
                        opacity: 0;
                        transform: translateY(-12px);
                        transition: opacity .2s ease, transform .2s ease;
                    }

                    .after-login-newsletter-toast.visible {
                        opacity: 1;
                        transform: translateY(0);
                    }

                    .after-login-newsletter-toast__mark {
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        width: 1.8rem;
                        height: 1.8rem;
                        color: #18151c;
                        font-weight: 800;
                        background: linear-gradient(135deg, #f2d9a7, #c8a5ff);
                        border-radius: 50%;
                    }

                    .after-login-newsletter-toast__text {
                        font-size: 1rem;
                        font-weight: 700;
                        line-height: 1.35;
                    }

                    .after-login-newsletter-toast__close {
                        padding: .15rem .3rem;
                        color: rgba(247, 244, 237, .72);
                        font: inherit;
                        font-size: 1.35rem;
                        line-height: 1;
                        background: transparent;
                        border: 0;
                        cursor: pointer;
                    }

                    @media (max-width: 600px) {
                        .after-login-newsletter-toast {
                            top: .75rem;
                            right: .75rem;
                            width: calc(100vw - 1.5rem);
                        }

                        .after-login-subscribe__row {
                            grid-template-columns: 1fr;
                        }

                        .after-login-subscribe__label {
                            text-align: left;
                        }

                        .after-login-invitation__actions {
                            flex-direction: column;
                        }

                        .after-login-invitation__button {
                            width: 100%;
                        }
                    }
                </style>
            </section>`;

function fail(message) {
  throw new Error(message);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024
  });

  if (result.status !== 0) {
    fail(`${command} failed: ${(result.stderr || result.stdout || '').trim()}`);
  }

  return result.stdout;
}

function replaceInvitation(source) {
  const matches = source.match(/<section class="after-login-invitation">/g) || [];
  if (matches.length !== 1) {
    fail(`Expected exactly one after-login-invitation section, found ${matches.length}`);
  }

  const replaced = source.replace(
    /\s*<section class="after-login-invitation">[\s\S]*?<\/section>/,
    `\n\n${NEW_TEMPLATE}`
  );

  if (replaced === source) fail('Theme invitation replacement made no changes');
  if (!replaced.includes(`action="${SIGNUP_ENDPOINT}"`)) fail('Custom signup endpoint missing');
  if (!replaced.includes('name="language" type="hidden" value="ru"')) fail('RU language marker missing');
  if (!replaced.includes('name="language" type="hidden" value="en"')) fail('EN language marker missing');
  if (!replaced.includes(`mailto:${CONTACT_EMAIL}`)) fail('Contact email marker missing');
  if (!replaced.includes('Статья заканчивается здесь, но разговор — нет.')) fail('RU Lounge copy changed unexpectedly');
  if (!replaced.includes('The article ends here, but the conversation doesn’t.')) fail('EN Lounge copy missing');

  return replaced;
}

function main() {
  const themeSource = fs.readFileSync(THEME_FILE, 'utf8');
  const updatedTheme = replaceInvitation(themeSource);

  console.log(`Theme: ${THEME_FILE}`);
  console.log(`Signup endpoint: ${SIGNUP_ENDPOINT}`);
  console.log(`Contact: ${CONTACT_EMAIL}`);
  console.log('Theme block: ready to replace');

  if (!APPLY) {
    console.log('Dry run passed. Nothing changed. Run again with --apply.');
    return;
  }

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  const backupDir = path.join(BACKUP_ROOT, `subscription-cta-${stamp}`);
  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(path.join(backupDir, 'post.hbs'), themeSource);

  let themeWritten = false;
  try {
    fs.writeFileSync(THEME_FILE, updatedTheme);
    themeWritten = true;
    run('docker', ['restart', GHOST_CONTAINER]);

    const status = run('docker', ['inspect', '-f', '{{.State.Running}}', GHOST_CONTAINER]).trim();
    if (status !== 'true') fail('Ghost container is not running after restart');

    console.log(`Backup: ${backupDir}`);
    console.log('Theme: updated');
    console.log('Ghost: restarted and running');
  } catch (error) {
    console.error(`Apply failed: ${error.message}`);
    if (themeWritten) {
      fs.writeFileSync(THEME_FILE, themeSource);
      run('docker', ['restart', GHOST_CONTAINER]);
      console.error('Theme rollback completed');
    }
    throw error;
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}