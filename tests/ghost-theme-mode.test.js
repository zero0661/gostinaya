import test from 'node:test';
import assert from 'node:assert/strict';
import {
  updateDefaultTemplate,
  updateHeaderTemplate
} from '../services/GhostThemeModeService.js';

const defaultTemplate = `<!doctype html>
<html><head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    {{!-- This script sets the correct theme mode (light or dark) --}}
    <script>
      if (typeof Storage !== 'undefined') {
        const currentSavedTheme = localStorage.getItem('theme')
        if (currentSavedTheme && currentSavedTheme === 'dark') {
          document.documentElement.setAttribute('data-theme', 'dark')
        } else {
          document.documentElement.setAttribute('data-theme', 'light')
        }
      }
    </script>
</head><body>
    {{ghost_foot}}
</body></html>`;

const headerTemplate = `<div class="m-toggle-darkmode js-tooltip" data-tippy-content="Toggle" tabindex="0">
  <label for="toggle-darkmode" class="sr-only">Toggle</label>
  <input id="toggle-darkmode" type="checkbox" class="js-toggle-darkmode">
  <div>
    <span class="icon-moon moon" aria-hidden="true"></span>
    <span class="icon-sunny sun" aria-hidden="true"></span>
  </div>
</div>`;

test('dark is the default and an explicit light preference is preserved', () => {
  const result = updateDefaultTemplate(defaultTemplate);
  assert.match(result, /var theme = 'dark'/);
  assert.match(result, /localStorage\.getItem\('theme'\) === 'light'/);
  assert.doesNotMatch(result, /currentSavedTheme/);
  assert.ok(result.indexOf('after-login-theme-init') < result.indexOf('{{ghost_foot}}'));
});

test('mobile theme UI and label synchronization are installed', () => {
  const result = updateDefaultTemplate(defaultTemplate);
  assert.match(result, /max-width: 47\.99rem/);
  assert.match(result, /Светлая тема \/ Light theme/);
  assert.match(result, /Тёмная тема \/ Dark theme/);
  assert.match(result, /toggle\.checked = isDark/);
});

test('header theme control gains a visible mobile label', () => {
  const result = updateHeaderTemplate(headerTemplate);
  assert.match(result, /after-login-theme-ui/);
  assert.match(result, /after-login-theme-label/);
});

test('both transforms are idempotent', () => {
  const onceDefault = updateDefaultTemplate(defaultTemplate);
  const onceHeader = updateHeaderTemplate(headerTemplate);
  assert.equal(updateDefaultTemplate(onceDefault), onceDefault);
  assert.equal(updateHeaderTemplate(onceHeader), onceHeader);
});

test('unexpected templates fail safely', () => {
  assert.throws(() => updateDefaultTemplate('<html></html>'), /Viewport anchor/);
  assert.throws(() => updateHeaderTemplate('<header></header>'), /exactly one theme control/);
});
