import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

const db = new sqlite3.Database(
    path.join(dirname, '..', 'database', 'gostinaya.db')
);

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (error) {
            if (error) reject(error);
            else resolve(this);
        });
    });
}

function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (error, rows) => {
            if (error) reject(error);
            else resolve(rows);
        });
    });
}

function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (error, row) => {
            if (error) reject(error);
            else resolve(row);
        });
    });
}

export default {
    async create({
        recipientId,
        actorId = null,
        type,
        topicId = null,
        messageId = null,
        text
    }) {
        if (
            recipientId &&
            actorId &&
            Number(recipientId) === Number(actorId)
        ) {
            return null;
        }

        return run(
            `
            INSERT INTO notifications
            (
                recipient_id,
                actor_id,
                type,
                topic_id,
                message_id,
                text
            )
            VALUES (?, ?, ?, ?, ?, ?)
            `,
            [
                recipientId,
                actorId,
                type,
                topicId,
                messageId,
                text
            ]
        );
    },

    async listForRecipient(recipientId, limit = 30) {
        return all(
            `
            SELECT
                n.*,
                actor.name AS actor_name,
                t.title AS topic_title
            FROM notifications n
            LEFT JOIN guests actor
                ON actor.id = n.actor_id
            LEFT JOIN discussion_topics t
                ON t.id = n.topic_id
            WHERE n.recipient_id = ?
            ORDER BY n.created_at DESC
            LIMIT ?
            `,
            [recipientId, limit]
        );
    },

    async countUnread(recipientId) {
        const row = await get(
            `
            SELECT COUNT(*) AS total
            FROM notifications
            WHERE recipient_id = ?
              AND read_at IS NULL
            `,
            [recipientId]
        );

        return row ? Number(row.total) : 0;
    },

    async markRead(notificationId, recipientId) {
        return run(
            `
            UPDATE notifications
            SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
            WHERE id = ?
              AND recipient_id = ?
            `,
            [notificationId, recipientId]
        );
    },

    async markAllRead(recipientId) {
        return run(
            `
            UPDATE notifications
            SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
            WHERE recipient_id = ?
            `,
            [recipientId]
        );
    }
};
