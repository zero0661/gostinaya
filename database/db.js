import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'gostinaya.db');

const db = new sqlite3.Database(dbPath, (error) => {
    if (error) {
        console.error('Database connection error:', error.message);
    } else {
        console.log('Database connected:', dbPath);
    }
});

export default db;
