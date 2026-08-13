import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new sqlite3.Database(
    path.join(__dirname, 'gostinaya.db')
);

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS article_discussions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            topic_id INTEGER NOT NULL UNIQUE,

            ghost_post_id_ru TEXT,
            ghost_post_id_en TEXT,

            url_ru TEXT,
            url_en TEXT,

            published_at TEXT,

            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE UNIQUE INDEX IF NOT EXISTS
        idx_article_discussions_ghost_post_id_ru
        ON article_discussions(ghost_post_id_ru)
        WHERE ghost_post_id_ru IS NOT NULL
    `);

    db.run(`
        CREATE UNIQUE INDEX IF NOT EXISTS
        idx_article_discussions_ghost_post_id_en
        ON article_discussions(ghost_post_id_en)
        WHERE ghost_post_id_en IS NOT NULL
    `);

    db.run(`
        CREATE UNIQUE INDEX IF NOT EXISTS
        idx_article_discussions_url_ru
        ON article_discussions(url_ru)
        WHERE url_ru IS NOT NULL
    `);

    db.run(`
        CREATE UNIQUE INDEX IF NOT EXISTS
        idx_article_discussions_url_en
        ON article_discussions(url_en)
        WHERE url_en IS NOT NULL
    `);
});

db.close(() => {
    console.log('Article discussions table created.');
});
