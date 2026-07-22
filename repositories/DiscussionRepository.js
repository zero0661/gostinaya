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

    async listTopics(room) {
        return all(
            `
            SELECT
                t.*,
                g.name AS author,
                (
                    SELECT COUNT(*)
                    FROM discussion_messages m
                    WHERE m.topic_id = t.id
                ) AS replies,
                (
                    SELECT MAX(created_at)
                    FROM discussion_messages m
                    WHERE m.topic_id = t.id
                ) AS last_reply_at,
                (
                    SELECT g2.name
                    FROM discussion_messages m2
                    JOIN guests g2 ON g2.id = m2.author_id
                    WHERE m2.topic_id = t.id
                    ORDER BY m2.created_at DESC, m2.id DESC
                    LIMIT 1
                ) AS last_reply_author,

                (
                    SELECT substr(body,1,140)
                    FROM discussion_messages m3
                    WHERE m3.topic_id=t.id
                    ORDER BY m3.created_at ASC
                    LIMIT 1
                ) AS preview
            FROM discussion_topics t
            JOIN guests g ON g.id = t.author_id
            WHERE room = ?
            ORDER BY pinned DESC,
                     COALESCE(last_reply_at, t.created_at) DESC
            `,
            [room]
        );
    },

    async getTopic(id) {
        return get(
            `
            SELECT
                t.*,
                g.name AS author
            FROM discussion_topics t
            JOIN guests g ON g.id = t.author_id
            WHERE t.id = ?
            `,
            [id]
        );
    },

    async listMessages(topicId) {
        return all(
            `
            SELECT
                m.*,
                g.name AS author
            FROM discussion_messages m
            JOIN guests g ON g.id = m.author_id
            WHERE m.topic_id = ?
            ORDER BY m.created_at ASC
            `,
            [topicId]
        );
    },

    async createTopic(room, title, authorId) {
        return run(
            `
            INSERT INTO discussion_topics
            (room,title,author_id)
            VALUES (?,?,?)
            `,
            [room, title, authorId]
        );
    },

    async createMessage(topicId, authorId, body) {
        return run(
            `
            INSERT INTO discussion_messages
            (topic_id, author_id, body)
            VALUES (?, ?, ?)
            `,
            [topicId, authorId, body]
        );
    }

};
