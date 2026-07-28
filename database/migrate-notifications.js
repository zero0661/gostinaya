import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

const db = new sqlite3.Database(
    path.join(dirname, 'gostinaya.db')
);

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            recipient_id INTEGER NOT NULL,
            actor_id INTEGER,
            type TEXT NOT NULL,
            topic_id INTEGER,
            message_id INTEGER,
            text TEXT NOT NULL,
            read_at TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE INDEX IF NOT EXISTS
        idx_notifications_recipient
        ON notifications(recipient_id, created_at DESC)
    `);

    db.run(`
        CREATE INDEX IF NOT EXISTS
        idx_notifications_unread
        ON notifications(recipient_id, read_at)
    `);
});

db.close(error => {
    if (error) {
        console.error(error);
        process.exit(1);
    }

    console.log('Таблица уведомлений создана');
});
