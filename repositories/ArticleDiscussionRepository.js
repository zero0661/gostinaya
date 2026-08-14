import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const db = new sqlite3.Database(process.env.GOSTINAYA_DB_PATH || path.join(__dirname, '..', 'database', 'gostinaya.db'));

function all(sql, params = []) { return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows))); }
function get(sql, params = []) { return new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row))); }
function run(sql, params = []) { return new Promise((resolve, reject) => db.run(sql, params, function (err) { err ? reject(err) : resolve(this); })); }

async function transaction(work) {
  await run('BEGIN IMMEDIATE');
  try {
    const result = await work();
    await run('COMMIT');
    return result;
  } catch (error) {
    try { await run('ROLLBACK'); } catch (_) { /* preserve the original error */ }
    throw error;
  }
}

export default {
  async list() {
    return all(`SELECT ad.*, t.title, t.pinned,
      (SELECT COUNT(*) FROM discussion_messages m WHERE m.topic_id = ad.topic_id AND m.hidden_at IS NULL) AS messages_count,
      (SELECT MAX(m.created_at) FROM discussion_messages m WHERE m.topic_id = ad.topic_id AND m.hidden_at IS NULL) AS last_message_at,
      (SELECT g.name FROM discussion_messages m JOIN guests g ON g.id = m.author_id WHERE m.topic_id = ad.topic_id AND m.hidden_at IS NULL ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_message_author
      FROM article_discussions ad JOIN discussion_topics t ON t.id = ad.topic_id
      WHERE t.hidden_at IS NULL
      ORDER BY t.pinned DESC, COALESCE(ad.published_at, ad.created_at) DESC`);
  },

  async getByTopicId(topicId) { return get('SELECT * FROM article_discussions WHERE topic_id = ?', [topicId]); },

  async getByGhostPostId(ghostPostId) {
    return get('SELECT * FROM article_discussions WHERE ghost_post_id_ru = ? OR ghost_post_id_en = ? LIMIT 1', [ghostPostId, ghostPostId]);
  },

  async getByGhostPostIds(ghostPostIds) {
    if (!ghostPostIds.length) return [];
    const placeholders = ghostPostIds.map(() => '?').join(', ');
    return all(`SELECT * FROM article_discussions WHERE ghost_post_id_ru IN (${placeholders}) OR ghost_post_id_en IN (${placeholders})`, [...ghostPostIds, ...ghostPostIds]);
  },

  async updateLanguageVersion(topicId, { ghostPostIdRu = null, ghostPostIdEn = null, urlRu = null, urlEn = null, publishedAt = null }) {
    return run(`UPDATE article_discussions SET
      ghost_post_id_ru = COALESCE(?, ghost_post_id_ru), ghost_post_id_en = COALESCE(?, ghost_post_id_en),
      url_ru = COALESCE(?, url_ru), url_en = COALESCE(?, url_en),
      published_at = COALESCE(?, published_at), updated_at = CURRENT_TIMESTAMP
      WHERE topic_id = ?`, [ghostPostIdRu, ghostPostIdEn, urlRu, urlEn, publishedAt, topicId]);
  },

  async create({ topicId, ghostPostIdRu = null, ghostPostIdEn = null, urlRu = null, urlEn = null, publishedAt = null }) {
    return run(`INSERT INTO article_discussions (topic_id, ghost_post_id_ru, ghost_post_id_en, url_ru, url_en, published_at)
      VALUES (?, ?, ?, ?, ?, ?)`, [topicId, ghostPostIdRu, ghostPostIdEn, urlRu, urlEn, publishedAt]);
  },

  async createWithTopic({ title, authorId, ghostPostIdRu = null, ghostPostIdEn = null, urlRu = null, urlEn = null, publishedAt = null }) {
    return transaction(async () => {
      const topic = await run(`INSERT INTO discussion_topics (room, title, author_id)
        VALUES ('articles', ?, ?)`, [title, authorId]);
      await run(`INSERT INTO article_discussions
        (topic_id, ghost_post_id_ru, ghost_post_id_en, url_ru, url_en, published_at)
        VALUES (?, ?, ?, ?, ?, ?)`, [
        topic.lastID, ghostPostIdRu, ghostPostIdEn, urlRu, urlEn, publishedAt
      ]);
      return { topicId: Number(topic.lastID) };
    });
  },

  async mergeTopics({ primaryTopicId, duplicateTopicId, languageVersion }) {
    if (Number(primaryTopicId) === Number(duplicateTopicId)) return { topicId: Number(primaryTopicId), merged: false };

    return transaction(async () => {
      const [primary, duplicate] = await Promise.all([
        get('SELECT * FROM article_discussions WHERE topic_id = ?', [primaryTopicId]),
        get('SELECT * FROM article_discussions WHERE topic_id = ?', [duplicateTopicId])
      ]);
      if (!primary || !duplicate) throw new Error('Cannot merge: article discussion record is missing');

      await run('UPDATE discussion_messages SET topic_id = ? WHERE topic_id = ?', [primaryTopicId, duplicateTopicId]);
      await run('UPDATE notifications SET topic_id = ? WHERE topic_id = ?', [primaryTopicId, duplicateTopicId]);

      // There is one read marker per guest/topic.  Keep the marker written most recently,
      // then remove only the now-redundant marker for the duplicate topic.
      await run(`INSERT INTO discussion_topic_reads (guest_id, topic_id, last_read_message_id, last_read_at)
        SELECT guest_id, ?, last_read_message_id, last_read_at
        FROM discussion_topic_reads WHERE topic_id = ?
        ON CONFLICT(guest_id, topic_id) DO UPDATE SET
          last_read_message_id = CASE WHEN excluded.last_read_at > discussion_topic_reads.last_read_at
            THEN excluded.last_read_message_id ELSE discussion_topic_reads.last_read_message_id END,
          last_read_at = CASE WHEN excluded.last_read_at > discussion_topic_reads.last_read_at
            THEN excluded.last_read_at ELSE discussion_topic_reads.last_read_at END`, [primaryTopicId, duplicateTopicId]);
      await run('DELETE FROM discussion_topic_reads WHERE topic_id = ?', [duplicateTopicId]);

      await run(`UPDATE article_discussions SET ghost_post_id_ru = ?, ghost_post_id_en = ?,
        url_ru = ?, url_en = ?, published_at = ?, updated_at = CURRENT_TIMESTAMP WHERE topic_id = ?`, [
        languageVersion.ghostPostIdRu, languageVersion.ghostPostIdEn,
        languageVersion.urlRu, languageVersion.urlEn, languageVersion.publishedAt, primaryTopicId
      ]);
      await run('DELETE FROM article_discussions WHERE topic_id = ?', [duplicateTopicId]);
      await run('DELETE FROM discussion_topics WHERE id = ?', [duplicateTopicId]);
      return { topicId: Number(primaryTopicId), merged: true };
    });
  }
};
