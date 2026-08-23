import test from 'node:test';
import assert from 'node:assert/strict';
import { linkifyText } from '../utils/linkifyText.js';

test('turns http and https addresses into safe external links', () => {
  const html = linkifyText('Сайт: https://milenin.pro/poslie-titrov/ и http://example.com');

  assert.match(html, /href="https:\/\/milenin\.pro\/poslie-titrov\/"/);
  assert.match(html, /href="http:\/\/example\.com"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer nofollow"/);
});

test('keeps sentence punctuation outside the generated link', () => {
  const html = linkifyText('Читайте: https://milenin.pro/poslie-titrov/.');

  assert.match(html, /href="https:\/\/milenin\.pro\/poslie-titrov\/"/);
  assert.match(html, /<\/a>\.$/);
});

test('escapes user html and never turns non-http schemes into links', () => {
  const html = linkifyText('<script>alert(1)</script> javascript:alert(2)');

  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /href=/);
});

test('preserves line breaks for pre-wrap message rendering', () => {
  const html = linkifyText('Первая строка\nhttps://milenin.pro/');

  assert.match(html, /Первая строка\n<a class="message-link"/);
});
