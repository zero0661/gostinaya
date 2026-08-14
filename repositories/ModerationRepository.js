import db from '../database/db.js';

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => error ? reject(error) : resolve(row));
  });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (error) {
      if (error) return reject(error);
      resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

export default {
  async countOpenReports() {
    const row = await get("SELECT COUNT(*) AS total FROM moderation_reports WHERE status = 'open'");
    return Number(row.total);
  },

  async dashboard() {
    const [accounts, blocked, topics, hiddenTopics, hiddenMessages, openReports, actions] = await Promise.all([
      get("SELECT COUNT(*) AS total FROM guests WHERE role NOT IN ('system', 'legacy')"),
      get('SELECT COUNT(*) AS total FROM guests WHERE is_blocked = 1'),
      get('SELECT COUNT(*) AS total FROM discussion_topics'),
      get('SELECT COUNT(*) AS total FROM discussion_topics WHERE hidden_at IS NOT NULL'),
      get('SELECT COUNT(*) AS total FROM discussion_messages WHERE hidden_at IS NOT NULL'),
      get("SELECT COUNT(*) AS total FROM moderation_reports WHERE status = 'open'"),
      this.listActions(12)
    ]);
    return {
      accounts: Number(accounts.total),
      blocked: Number(blocked.total),
      topics: Number(topics.total),
      hiddenTopics: Number(hiddenTopics.total),
      hiddenMessages: Number(hiddenMessages.total),
      openReports: Number(openReports.total),
      actions
    };
  },

  listAccounts(search = '') {
    const query = `%${search}%`;
    return all(`
      SELECT id, email, name, role, language, created_at, email_verified_at,
             is_blocked, blocked_at, blocked_reason
      FROM guests
      WHERE role NOT IN ('system', 'legacy')
        AND (? = '' OR LOWER(email) LIKE LOWER(?) OR LOWER(name) LIKE LOWER(?))
      ORDER BY is_blocked DESC, created_at DESC, id DESC
      LIMIT 200
    `, [search, query, query]);
  },

  getAccount(id) {
    return get(`
      SELECT id, email, name, role, is_blocked, blocked_at, blocked_reason
      FROM guests WHERE id = ?
    `, [id]);
  },

  setAccountBlocked(id, blocked, actorId, reason = '') {
    return run(`
      UPDATE guests
      SET is_blocked = ?,
          blocked_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END,
          blocked_by = CASE WHEN ? = 1 THEN ? ELSE NULL END,
          blocked_reason = CASE WHEN ? = 1 THEN ? ELSE '' END
      WHERE id = ?
    `, [blocked ? 1 : 0, blocked ? 1 : 0, blocked ? 1 : 0, actorId, blocked ? 1 : 0, reason, id]);
  },

  setAccountRole(id, role) {
    return run('UPDATE guests SET role = ? WHERE id = ?', [role, id]);
  },

  listTopics({ search = '', room = '' } = {}) {
    const query = `%${search}%`;
    return all(`
      SELECT t.*, g.name AS author,
             (SELECT COUNT(*) FROM discussion_messages m WHERE m.topic_id = t.id) AS messages_count,
             (SELECT COUNT(*) FROM moderation_reports r WHERE r.topic_id = t.id AND r.status = 'open') AS open_reports
      FROM discussion_topics t
      JOIN guests g ON g.id = t.author_id
      WHERE (? = '' OR t.room = ?)
        AND (? = '' OR LOWER(t.title) LIKE LOWER(?) OR LOWER(g.name) LIKE LOWER(?))
      ORDER BY t.hidden_at IS NOT NULL DESC, t.created_at DESC, t.id DESC
      LIMIT 200
    `, [room, room, search, query, query]);
  },

  getTopic(id) {
    return get(`
      SELECT t.*, g.name AS author
      FROM discussion_topics t
      JOIN guests g ON g.id = t.author_id
      WHERE t.id = ?
    `, [id]);
  },

  listTopicMessages(topicId) {
    return all(`
      SELECT m.*, g.name AS author,
             (SELECT COUNT(*) FROM moderation_reports r WHERE r.message_id = m.id AND r.status = 'open') AS open_reports
      FROM discussion_messages m
      JOIN guests g ON g.id = m.author_id
      WHERE m.topic_id = ?
      ORDER BY m.created_at ASC, m.id ASC
    `, [topicId]);
  },

  getMessage(id) {
    return get(`
      SELECT m.*, g.name AS author
      FROM discussion_messages m
      JOIN guests g ON g.id = m.author_id
      WHERE m.id = ?
    `, [id]);
  },

  setTopicFlag(id, field, enabled, actorId, reason = '') {
    const allowed = new Set(['pinned', 'closed', 'hidden']);
    if (!allowed.has(field)) throw new Error('Unsupported topic moderation field.');
    if (field === 'hidden') {
      return run(`
        UPDATE discussion_topics
        SET hidden_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END,
            hidden_by = CASE WHEN ? = 1 THEN ? ELSE NULL END,
            hidden_reason = CASE WHEN ? = 1 THEN ? ELSE '' END
        WHERE id = ?
      `, [enabled ? 1 : 0, enabled ? 1 : 0, actorId, enabled ? 1 : 0, reason, id]);
    }
    return run(`UPDATE discussion_topics SET ${field} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [enabled ? 1 : 0, id]);
  },

  setMessageHidden(id, hidden, actorId, reason = '') {
    return run(`
      UPDATE discussion_messages
      SET hidden_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END,
          hidden_by = CASE WHEN ? = 1 THEN ? ELSE NULL END,
          hidden_reason = CASE WHEN ? = 1 THEN ? ELSE '' END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [hidden ? 1 : 0, hidden ? 1 : 0, actorId, hidden ? 1 : 0, reason, id]);
  },

  async createReport({ reporterId, topicId = null, messageId = null, reason }) {
    const existing = await get(`
      SELECT id FROM moderation_reports
      WHERE reporter_id = ? AND status = 'open'
        AND COALESCE(topic_id, 0) = COALESCE(?, 0)
        AND COALESCE(message_id, 0) = COALESCE(?, 0)
      LIMIT 1
    `, [reporterId, topicId, messageId]);
    if (existing) return { created: false, id: existing.id };
    const result = await run(`
      INSERT INTO moderation_reports (reporter_id, topic_id, message_id, reason)
      VALUES (?, ?, ?, ?)
    `, [reporterId, topicId, messageId, reason]);
    return { created: true, id: result.lastID };
  },

  listReports(status = 'open') {
    return all(`
      SELECT r.*, COALESCE(r.topic_id, m.topic_id) AS target_topic_id,
             reporter.name AS reporter_name, reviewer.name AS reviewer_name,
             t.title AS topic_title, m.body AS message_body, m.author_id AS message_author_id,
             author.name AS message_author
      FROM moderation_reports r
      JOIN guests reporter ON reporter.id = r.reporter_id
      LEFT JOIN guests reviewer ON reviewer.id = r.reviewed_by
      LEFT JOIN discussion_messages m ON m.id = r.message_id
      LEFT JOIN discussion_topics t ON t.id = COALESCE(r.topic_id, m.topic_id)
      LEFT JOIN guests author ON author.id = m.author_id
      WHERE (? = 'all' OR r.status = ?)
      ORDER BY CASE r.status WHEN 'open' THEN 0 ELSE 1 END, r.created_at DESC, r.id DESC
      LIMIT 200
    `, [status, status]);
  },

  getReport(id) {
    return get('SELECT * FROM moderation_reports WHERE id = ?', [id]);
  },

  updateReport(id, status, reviewerId, note = '') {
    return run(`
      UPDATE moderation_reports
      SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, resolution_note = ?
      WHERE id = ?
    `, [status, reviewerId, note, id]);
  },

  recordAction({ actor, action, targetType, targetId, details = '' }) {
    return run(`
      INSERT INTO moderation_actions (actor_id, actor_name, action, target_type, target_id, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [actor.id, actor.name, action, targetType, targetId, details]);
  },

  listActions(limit = 100) {
    return all(`
      SELECT * FROM moderation_actions
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `, [Number(limit)]);
  }
};
