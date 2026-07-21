import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'gostinaya.db');

const columns = [
    ['location', "TEXT DEFAULT ''"],
    ['bio', "TEXT DEFAULT ''"],
    ['notify_replies', 'INTEGER NOT NULL DEFAULT 1'],
    ['notify_followed_discussions', 'INTEGER NOT NULL DEFAULT 1'],
    ['notify_publications', 'INTEGER NOT NULL DEFAULT 1'],
    ['notify_new_topics', 'INTEGER NOT NULL DEFAULT 0']
];

const db = new sqlite3.Database(dbPath);

db.all('PRAGMA table_info(guests)', (error, rows) => {
    if (error) {
        console.error(error);
        process.exitCode = 1;
        db.close();
        return;
    }

    const existing = new Set(rows.map((row) => row.name));
    const missing = columns.filter(([name]) => !existing.has(name));

    const addNext = (index = 0) => {
        if (index >= missing.length) {
            console.log(
                missing.length
                    ? `Добавлено полей: ${missing.length}`
                    : 'Миграция не требуется: все поля уже существуют'
            );

            db.close();
            return;
        }

        const [name, definition] = missing[index];

        db.run(
            `ALTER TABLE guests ADD COLUMN ${name} ${definition}`,
            (alterError) => {
                if (alterError) {
                    console.error(`Ошибка поля ${name}:`, alterError);
                    process.exitCode = 1;
                    db.close();
                    return;
                }

                console.log(`Добавлено поле: ${name}`);
                addNext(index + 1);
            }
        );
    };

    addNext();
});
