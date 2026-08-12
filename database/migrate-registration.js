import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'gostinaya.db');

const columns = [
    ['country', "TEXT DEFAULT ''"],
    ['city', "TEXT DEFAULT ''"],
    ['join_reason', "TEXT DEFAULT ''"],
    ['current_topic', "TEXT DEFAULT ''"],
    ['rules_accepted_at', 'TEXT'],
    ['privacy_accepted_at', 'TEXT']
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
                    ? `Добавлено полей регистрации: ${missing.length}`
                    : 'Миграция регистрации не требуется'
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

                console.log(`Добавлено поле регистрации: ${name}`);
                addNext(index + 1);
            }
        );
    };

    addNext();
});
