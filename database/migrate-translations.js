import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'gostinaya.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS discussion_translations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL CHECK (entity_type IN ('topic', 'message')),
      entity_id INTEGER NOT NULL,
      source_hash TEXT NOT NULL,
      source_lang TEXT NOT NULL CHECK (source_lang IN ('ru', 'en')),
      target_lang TEXT NOT NULL CHECK (target_lang IN ('ru', 'en')),
      translated_text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(entity_type, entity_id, source_hash, target_lang)
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_discussion_translations_lookup
    ON discussion_translations(entity_type, entity_id, source_hash, target_lang)
  `);
});

db.close();
console.log('Discussion translations migration complete:', dbPath);
