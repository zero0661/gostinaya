import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import rooms from '../config/rooms.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dirname, '..');

test('project news is a dedicated discussion room', () => {
  assert.equal(rooms.news.title, 'Новости проекта');
  assert.match(rooms.news.text, /обсудить/);
});

test('hall and sidebar expose project news as a separate destination', async () => {
  const [hall, sidebar] = await Promise.all([
    fs.readFile(path.join(root, 'views', 'hall', 'index.ejs'), 'utf8'),
    fs.readFile(path.join(root, 'views', 'partials', 'sidebar.ejs'), 'utf8')
  ]);

  assert.match(hall, /roomStats\?\.news/);
  assert.match(hall, /href="\/gostinaya\/news"/);
  assert.match(hall, /Новости проекта/);
  assert.match(sidebar, /href="\/gostinaya\/news"/);
});

test('news creation is protected on both GET and POST server routes', async () => {
  const source = await fs.readFile(path.join(root, 'app.js'), 'utf8');
  const accessChecks = source.match(/roomKey === 'news' && !isModerator\(req\.session\.guest\.role\)/g) || [];

  assert.equal(accessChecks.length, 2);
  assert.match(source, /roomKey === 'news' && isModerator\(req\.session\.guest\.role\)/);
});

test('news room keeps the standard topic thread while using news-specific labels', async () => {
  const [room, topic, form] = await Promise.all([
    fs.readFile(path.join(root, 'views', 'rooms', 'gostinaya.ejs'), 'utf8'),
    fs.readFile(path.join(root, 'views', 'rooms', 'topic.ejs'), 'utf8'),
    fs.readFile(path.join(root, 'views', 'rooms', 'new-topic.ejs'), 'utf8')
  ]);

  assert.match(room, /Опубликовать новость/);
  assert.match(topic, /Обсуждение новости/);
  assert.match(topic, /action="\/gostinaya\/topic\/<%= topic\.id %>\/messages"/);
  assert.match(form, /Опубликовать новость/);
});
