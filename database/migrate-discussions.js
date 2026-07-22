import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new sqlite3.Database(path.join(__dirname, 'gostinaya.db'));

db.serialize(() => {

db.run(`
CREATE TABLE IF NOT EXISTS discussion_topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room TEXT NOT NULL,
    title TEXT NOT NULL,
    author_id INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    pinned INTEGER DEFAULT 0,
    closed INTEGER DEFAULT 0
)
`);

db.run(`
CREATE TABLE IF NOT EXISTS discussion_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_id INTEGER NOT NULL,
    author_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)
`);

});

db.close(() => console.log('Discussion tables created.'));
