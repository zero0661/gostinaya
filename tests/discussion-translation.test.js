import test from 'node:test';
import assert from 'node:assert/strict';
import DiscussionTranslationService from '../services/DiscussionTranslationService.js';

test('detects Russian titles that contain Latin product names', () => {
  assert.equal(
    DiscussionTranslationService.detectLanguage('Фильм Soulm8te'),
    'ru'
  );
});

test('detects English titles that contain a Russian word', () => {
  assert.equal(
    DiscussionTranslationService.detectLanguage('Soulm8te фильм discussion'),
    'en'
  );
});

test('detects plain Russian and English text', () => {
  assert.equal(
    DiscussionTranslationService.detectLanguage('Недавно посмотрел этот фильм'),
    'ru'
  );
  assert.equal(
    DiscussionTranslationService.detectLanguage('I recently watched this film'),
    'en'
  );
});
