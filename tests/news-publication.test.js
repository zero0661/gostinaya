import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ejs from 'ejs';
import { NewsPublicationService } from '../services/NewsPublicationServiceCore.js';

test('Russian news preserves the original and prepares both English fields before publication', async () => {
  const calls = [];
  const service = new NewsPublicationService({ detectLanguage: () => 'ru', translate: async (text, lang) => {
    calls.push({ text, lang });
    return `English: ${text}`;
  } });
  const result = await service.prepare({ title: 'Новость', body: 'Первый абзац\n\nВторой абзац' });
  assert.equal(result.titleRu, 'Новость');
  assert.equal(result.bodyRu, 'Первый абзац\n\nВторой абзац');
  assert.equal(result.bodyEn, 'English: Первый абзац\n\nВторой абзац');
  assert.deepEqual(calls.map(call => call.lang), ['en', 'en']);
});

test('English news prepares Russian fields regardless of account language', async () => {
  const service = new NewsPublicationService({ detectLanguage: () => 'en', translate: async (text, lang) => {
    assert.equal(lang, 'ru');
    return `Перевод ${text}`;
  } });
  const result = await service.prepare({ title: 'News', body: 'Original text', language: 'ru' });
  assert.equal(result.bodyEn, 'Original text');
  assert.equal(result.bodyRu, 'Перевод Original text');
});

test('already complete legacy news submissions do not call the translator', async () => {
  const service = new NewsPublicationService({ detectLanguage: assert.fail, translate: assert.fail });
  const versions = { titleRu: 'Новость', titleEn: 'News', bodyRu: 'Текст', bodyEn: 'Text' };
  assert.deepEqual(await service.prepare(versions), versions);
});

test('news preparation rejects unavailable, empty and oversized translations without a partial result', async () => {
  for (const translate of [async () => { throw new Error('SMTP-independent translation outage'); }, async () => '', async () => 'x'.repeat(5001)]) {
    const service = new NewsPublicationService({ detectLanguage: () => 'ru', translate });
    await assert.rejects(service.prepare({ title: 'Новость', body: 'Текст' }));
  }
});

test('news validation rejects missing input before calling translation', async () => {
  const service = new NewsPublicationService({ detectLanguage: assert.fail, translate: assert.fail });
  await assert.rejects(service.prepare({ title: 'Новость', body: '' }), /INVALID_NEWS_INPUT/);
});

test('news form has one editor and retains escaped draft text after a translation error', async () => {
  const source = await fs.readFile(new URL('../views/rooms/new-topic.ejs', import.meta.url), 'utf8');
  const html = ejs.render(source, { roomKey: 'news', form: { title: 'A "title"', body: '<script>Draft</script>' }, error: 'Try again' });
  assert.equal((html.match(/name="title"/g) || []).length, 1);
  assert.equal((html.match(/name="body"/g) || []).length, 1);
  assert.doesNotMatch(html, /name="(?:title|body)_(?:ru|en)"/);
  assert.match(html, /&lt;script&gt;Draft&lt;\/script&gt;/);
  assert.match(html, /role="alert"/);
  assert.match(ejs.render(source, { roomKey: 'discussions' }), /Создать тему/);
});
