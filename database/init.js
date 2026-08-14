import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'gostinaya.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS guests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'guest',
            language TEXT NOT NULL DEFAULT 'ru',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            location TEXT DEFAULT '',
            bio TEXT DEFAULT '',
            notify_replies INTEGER NOT NULL DEFAULT 1,
            notify_followed_discussions INTEGER NOT NULL DEFAULT 1,
            notify_publications INTEGER NOT NULL DEFAULT 1,
            notify_new_topics INTEGER NOT NULL DEFAULT 0,
            country TEXT DEFAULT '',
            city TEXT DEFAULT '',
            join_reason TEXT DEFAULT '',
            current_topic TEXT DEFAULT '',
            rules_accepted_at TEXT,
            privacy_accepted_at TEXT,
            email_verified_at TEXT,
            email_verification_token_hash TEXT,
            email_verification_expires_at INTEGER,
            email_verification_sent_at INTEGER
        )
    `);
});

db.close();

console.log('Database initialized:', dbPath);
