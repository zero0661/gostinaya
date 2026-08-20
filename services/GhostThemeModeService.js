const THEME_INIT_MARKER = 'after-login-theme-init';
const THEME_UI_MARKER = 'after-login-theme-ui';
const THEME_LABEL_MARKER = 'after-login-theme-label';

const LEGACY_THEME_SCRIPT = /\s*\{\{!-- This script sets the correct theme mode \(light or dark\) --\}\}\s*<script>[\s\S]*?localStorage\.getItem\('theme'\)[\s\S]*?<\/script>/;

const THEME_INIT = `
    {{!-- ${THEME_INIT_MARKER}: dark by default, saved light preference respected --}}
    <script>
      (function () {
        var theme = 'dark'
        try {
          if (localStorage.getItem('theme') === 'light') theme = 'light'
        } catch (error) {}
        document.documentElement.setAttribute('data-theme', theme)
        document.documentElement.style.colorScheme = theme
      }())
    </script>`;

const THEME_UI = `
    {{!-- ${THEME_UI_MARKER}: accessible mobile control and synchronized label --}}
    <style>
      .${THEME_LABEL_MARKER} { display: none; }

      @media (max-width: 47.99rem) {
        .m-nav__right {
          flex-wrap: wrap;
          justify-content: flex-start;
          gap: .75rem;
        }

        .m-toggle-darkmode.${THEME_UI_MARKER} {
          position: relative;
          right: auto;
          bottom: auto;
          display: flex;
          align-items: center;
          justify-content: flex-start;
          gap: .75rem;
          width: 100%;
          height: 48px;
          padding: 0 1rem;
          overflow: hidden;
          border: 1px solid var(--border-color, rgba(255,255,255,.14));
          border-radius: 12px;
          background: var(--secondary-subtle-color, rgba(255,255,255,.06));
          cursor: pointer;
        }

        .m-toggle-darkmode.${THEME_UI_MARKER} input {
          inset: 0;
          width: 100%;
          height: 100%;
        }

        .m-toggle-darkmode.${THEME_UI_MARKER} > div {
          position: relative;
          top: auto;
          left: auto;
          flex: 0 0 28px;
          width: 28px;
          height: 28px;
        }

        .${THEME_LABEL_MARKER} {
          display: inline;
          color: var(--primary-foreground-color, inherit);
          font-size: 1rem;
          font-weight: 600;
          line-height: 1.2;
          pointer-events: none;
        }
      }
    </style>
    <script>
      document.addEventListener('DOMContentLoaded', function () {
        var toggle = document.querySelector('.js-toggle-darkmode')
        var control = document.querySelector('.${THEME_UI_MARKER}')
        var label = document.querySelector('.${THEME_LABEL_MARKER}')
        if (!toggle || !control || !label) return

        function updateThemeControl() {
          var isDark = document.documentElement.getAttribute('data-theme') === 'dark'
          var text = isDark
            ? 'Светлая тема / Light theme'
            : 'Тёмная тема / Dark theme'
          label.textContent = text
          toggle.checked = isDark
          control.setAttribute('aria-label', text)
          control.setAttribute('data-tippy-content', text)
          document.documentElement.style.colorScheme = isDark ? 'dark' : 'light'
        }

        updateThemeControl()
        toggle.addEventListener('change', function () {
          window.setTimeout(updateThemeControl, 0)
        })
      })
    </script>`;

export function updateDefaultTemplate(source) {
  if (source.includes(THEME_INIT_MARKER) && source.includes(THEME_UI_MARKER)) {
    return source;
  }
  if (source.includes(THEME_INIT_MARKER) || source.includes(THEME_UI_MARKER)) {
    throw new Error('Default template contains an incomplete managed theme update');
  }

  const viewport = '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />';
  if (!source.includes(viewport)) throw new Error('Viewport anchor not found in default.hbs');
  if (!LEGACY_THEME_SCRIPT.test(source)) throw new Error('Legacy theme initializer not found in default.hbs');
  if (!source.includes('{{ghost_foot}}')) throw new Error('ghost_foot anchor not found in default.hbs');

  return source
    .replace(viewport, `${viewport}\n${THEME_INIT}`)
    .replace(LEGACY_THEME_SCRIPT, '')
    .replace('    {{ghost_foot}}', `${THEME_UI}\n\n    {{ghost_foot}}`);
}

export function updateHeaderTemplate(source) {
  if (source.includes(THEME_LABEL_MARKER)) return source;

  const opening = '<div class="m-toggle-darkmode js-tooltip"';
  if ((source.match(new RegExp(opening, 'g')) || []).length !== 1) {
    throw new Error('Expected exactly one theme control in partials/header.hbs');
  }

  const updated = source
    .replace(opening, `<div class="m-toggle-darkmode ${THEME_UI_MARKER} js-tooltip"`)
    .replace(
      /(<span class="icon-sunny sun" aria-hidden="true"><\/span>\s*<\/div>)(\s*<\/div>)/,
      `$1\n              <span class="${THEME_LABEL_MARKER}" aria-hidden="true">Светлая тема / Light theme</span>$2`
    );

  if (!updated.includes(THEME_LABEL_MARKER)) {
    throw new Error('Theme label insertion failed in partials/header.hbs');
  }
  return updated;
}
