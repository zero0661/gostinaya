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

    async listTopics(room, guestId) {
        return all(
            `
            SELECT
                t.*,
                g.name AS author,
        (
          SELECT COUNT(*)
          FROM discussion_messages unread_m
          WHERE unread_m.topic_id = t.id
            AND unread_m.hidden_at IS NULL
            AND unread_m.author_id != ?
            AND unread_m.id > COALESCE(
              (
                SELECT reads.last_read_message_id
                FROM discussion_topic_reads reads
                WHERE reads.guest_id = ?
                  AND reads.topic_id = t.id
              ),
              0
            )
        ) AS unread_count,
                (
                    SELECT COUNT(*)
                    FROM discussion_messages m
                    WHERE m.topic_id = t.id
                      AND m.hidden_at IS NULL
                ) AS replies,
                (
                    SELECT MAX(created_at)
                    FROM discussion_messages m
                    WHERE m.topic_id = t.id
                      AND m.hidden_at IS NULL
                ) AS last_reply_at,
                (
                    SELECT g2.name
                    FROM discussion_messages m2
                    JOIN guests g2 ON g2.id = m2.author_id
                    WHERE m2.topic_id = t.id
                      AND m2.hidden_at IS NULL
                    ORDER BY m2.created_at DESC, m2.id DESC
                    LIMIT 1
                ) AS last_reply_author,

                (
                    SELECT substr(body,1,140)
                    FROM discussion_messages m3
                    WHERE m3.topic_id=t.id
                      AND m3.hidden_at IS NULL
                    ORDER BY m3.created_at ASC
                    LIMIT 1
                ) AS preview
            FROM discussion_topics t
            JOIN guests g ON g.id = t.author_id
            WHERE t.room = ?
              AND t.hidden_at IS NULL
            ORDER BY pinned DESC,
                     COALESCE(last_reply_at, t.created_at) DESC
            `,
            [guestId, guestId, room]
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
              AND t.hidden_at IS NULL
            `,
            [id]
        );
    },

    async listMessages(topicId) {
        return all(
            `
            SELECT
                m.*,
                CASE WHEN m.hidden_at IS NULL
                  THEN m.body
                  ELSE 'Сообщение скрыто модератором / Message hidden by a moderator'
                END AS body,
                g.name AS author
            FROM discussion_messages m
            JOIN guests g ON g.id = m.author_id
            WHERE m.topic_id = ?
            ORDER BY m.created_at ASC
            `,
            [topicId]
        );
    },

    async getRoomStats() {
    const [counts, activity] = await Promise.all([
      all(
        `
        SELECT
          t.room,
          COUNT(DISTINCT t.id) AS topics,
          COUNT(m.id) AS messages
        FROM discussion_topics t
        LEFT JOIN discussion_messages m ON m.topic_id = t.id
          AND m.hidden_at IS NULL
        WHERE t.hidden_at IS NULL
        GROUP BY t.room
        `
      ),
      this.getRecentActivity(1000)
    ]);

    const stats = {};

    counts.forEach(row => {
      stats[row.room] = {
        topics: Number(row.topics || 0),
        messages: Number(row.messages || 0),
        lastAuthor: null,
        lastActivityAt: null,
        lastTopicId: null,
        lastTopicTitle: null
      };
    });

    activity.forEach(item => {
      if (!stats[item.room]) {
        stats[item.room] = {
          topics: 0,
          messages: 0,
          lastAuthor: null,
          lastActivityAt: null,
          lastTopicId: null,
          lastTopicTitle: null
        };
      }

      if (!stats[item.room].lastActivityAt) {
        stats[item.room].lastAuthor = item.author;
        stats[item.room].lastActivityAt = item.activity_at;
        stats[item.room].lastTopicId = item.topic_id;
        stats[item.room].lastTopicTitle = item.title;
      }
    });

    return stats;
  },

  async getRecentActivity(limit = 10) {
    return all(
      `
      SELECT
        'topic' AS activity_type,
        t.id AS topic_id,
        t.room,
        t.title,
        NULL AS body,
        g.name AS author,
        t.created_at AS activity_at
      FROM discussion_topics t
      JOIN guests g ON g.id = t.author_id
      WHERE t.hidden_at IS NULL

      UNION ALL

      SELECT
        'reply' AS activity_type,
        t.id AS topic_id,
        t.room,
        t.title,
        m.body,
        g.name AS author,
        m.created_at AS activity_at
      FROM discussion_messages m
      JOIN discussion_topics t ON t.id = m.topic_id
      JOIN guests g ON g.id = m.author_id
      WHERE t.hidden_at IS NULL
        AND m.hidden_at IS NULL
        AND m.id != (
        SELECT MIN(first_message.id)
        FROM discussion_messages first_message
        WHERE first_message.topic_id = m.topic_id
          AND first_message.hidden_at IS NULL
      )

      ORDER BY activity_at DESC
      LIMIT ?
      `,
      [limit]
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

    async createMessage(topicId, authorId, body, parentMessageId = null) {
        return run(
            `
            INSERT INTO discussion_messages
            (topic_id, author_id, body, parent_message_id)
            VALUES (?, ?, ?, ?)
            `,
            [topicId, authorId, body, parentMessageId]
        );

    },

    async markTopicRead(guestId, topicId, messageId) {
        return run(
            `
            INSERT INTO discussion_topic_reads
              (guest_id, topic_id, last_read_message_id, last_read_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(guest_id, topic_id)
            DO UPDATE SET
              last_read_message_id = excluded.last_read_message_id,
              last_read_at = CURRENT_TIMESTAMP
            `,
            [guestId, topicId, messageId]
        );
    },

    async getTopicRead(guestId, topicId) {
        return get(
            `
            SELECT *
            FROM discussion_topic_reads
            WHERE guest_id = ? AND topic_id = ?
            `,
            [guestId, topicId]
        );
    }
,

  
async updateTopic(id, authorId, title) {
    return run(
        `
        UPDATE discussion_topics
        SET title = ?
        WHERE id = ?
          AND author_id = ?
        `,
        [title, id, authorId]
    );
},

async getMessage(id) {
    return get(
      `
        SELECT
          m.*,
          g.name AS author
        FROM discussion_messages m
        JOIN guests g ON g.id = m.author_id
        WHERE m.id = ?
          AND m.hidden_at IS NULL
      `,
      [id]
    );
  },

  async updateMessage(id, authorId, body) {
    return run(
      `
        UPDATE discussion_messages
        SET body = ?
        WHERE id = ?
          AND author_id = ?
      `,
      [body, id, authorId]
    );
  }

};
