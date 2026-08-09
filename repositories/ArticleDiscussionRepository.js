import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new sqlite3.Database(
    path.join(__dirname, '..', 'database', 'gostinaya.db')
);

function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

export default {

    async list() {
        return all(`
            SELECT
                ad.*,
                t.title,
                (
                    SELECT COUNT(*)
                    FROM discussion_messages m
                    WHERE m.topic_id = ad.topic_id
                ) AS messages_count,
                (
                    SELECT MAX(m.created_at)
                    FROM discussion_messages m
                    WHERE m.topic_id = ad.topic_id
                ) AS last_message_at,
                (
                    SELECT g.name
                    FROM discussion_messages m
                    JOIN guests g ON g.id = m.author_id
                    WHERE m.topic_id = ad.topic_id
                    ORDER BY m.created_at DESC, m.id DESC
                    LIMIT 1
                ) AS last_message_author
            FROM article_discussions ad
            JOIN discussion_topics t ON t.id = ad.topic_id
            ORDER BY COALESCE(ad.published_at, ad.created_at) DESC
        `);
    },

    async getByTopicId(topicId) {
        return get(
            `
            SELECT *
            FROM article_discussions
            WHERE topic_id = ?
            `,
            [topicId]
        );
    },

    async create({
        topicId,
        ghostPostIdRu = null,
        ghostPostIdEn = null,
        urlRu = null,
        urlEn = null,
        publishedAt = null
    }) {
        return run(
            `
            INSERT INTO article_discussions (
                topic_id,
                ghost_post_id_ru,
                ghost_post_id_en,
                url_ru,
                url_en,
                published_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
            `,
            [
                topicId,
                ghostPostIdRu,
                ghostPostIdEn,
                urlRu,
                urlEn,
                publishedAt
            ]
        );
    }

};
