import db from '../database/db.js';

class GuestRepository {
    findById(id) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT
                    id,
                    email,
                    name,
                    role,
                    language,
                    created_at,
                    COALESCE(location, '') AS location,
                    COALESCE(bio, '') AS bio,
                    notify_replies,
                    notify_followed_discussions,
                    notify_publications,
                    notify_new_topics
                 FROM guests
                 WHERE id = ?`,
                [id],
                (err, row) => {
                    if (err) {
                        return reject(err);
                    }

                    resolve(row);
                }
            );
        });
    }

    findByEmail(email) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT * FROM guests WHERE email = ?`,
                [email],
                (err, row) => {
                    if (err) {
                        return reject(err);
                    }

                    resolve(row);
                }
            );
        });
    }

    create(name, email, passwordHash, location, language) {
        return new Promise((resolve, reject) => {
            db.run(
               `INSERT INTO guests (name, email, password_hash, location, language)
                VALUES (?, ?, ?, ?, ?)`,
                [name, email, passwordHash, location, language],
                function (err) {
                    if (err) {
                        return reject(err);
                    }

                    resolve({
                        id: this.lastID,
                        name,
                        email
                    });
                }
            );
        });
    }

    updateSettings(id, settings) {
        return new Promise((resolve, reject) => {
            db.run(
                `UPDATE guests
                 SET
                    language = ?,
                    notify_replies = ?,
                    notify_followed_discussions = ?,
                    notify_publications = ?,
                    notify_new_topics = ?,
            profile_completed = ?
                 WHERE id = ?`,
                [
                    settings.language,
                    settings.notifyReplies,
                    settings.notifyFollowedDiscussions,
                    settings.notifyPublications,
                    settings.notifyNewTopics,
                    id
                ],
                function (error) {
                    if (error) {
                        return reject(error);
                    }

                    resolve(this.changes);
                }
            );
        });
    }

    updateProfile(id, profile) {
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE guests
         SET
           name = ?,
           location = ?,
           bio = ?,
           language = ?,
           notify_replies = ?,
           notify_followed_discussions = ?,
           notify_publications = ?,
           notify_new_topics = ?,
           profile_completed = ?
         WHERE id = ?`,
        [
          profile.name,
          profile.location,
          profile.bio,
          profile.language,
          profile.notifyReplies,
          profile.notifyFollowedDiscussions,
          profile.notifyPublications,
          profile.notifyNewTopics,
          profile.profileCompleted,
          id
        ],
        function (err) {
          if (err) {
            return reject(err);
          }

          resolve(this.changes);
        }
      );
    });
  }

  findPublicById(id) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT
                    g.id,
                    g.name,
                    g.role,
                    g.language,
                    g.created_at,
                    COALESCE(g.location, '') AS location,
                    COALESCE(g.bio, '') AS bio,
                    (
                        SELECT COUNT(*)
                        FROM discussion_topics t
                        WHERE t.author_id = g.id
                    ) AS topics_count,
                    (
                        SELECT COUNT(*)
                        FROM discussion_messages m
                        WHERE m.author_id = g.id
                    ) AS messages_count
                 FROM guests g
                 WHERE g.id = ?`,
                [id],
                (error, row) => {
                    if (error) {
                        return reject(error);
                    }

                    resolve(row);
                }
            );
        });
    }


    getPublicActivity(id) {
        const topicsPromise = new Promise((resolve, reject) => {
            db.all(
                `SELECT
                    id,
                    title,
                    created_at
                 FROM discussion_topics
                 WHERE author_id = ?
                 ORDER BY created_at DESC
                 LIMIT 10`,
                [id],
                (error, rows) => {
                    if (error) {
                        return reject(error);
                    }

                    resolve(rows);
                }
            );
        });

        const messagesPromise = new Promise((resolve, reject) => {
            db.all(
                `SELECT
                    m.id,
                    m.body,
                    m.created_at,
                    m.topic_id,
                    t.title
                 FROM discussion_messages m
                 JOIN discussion_topics t
                      ON t.id = m.topic_id
                 WHERE m.author_id = ?
                 ORDER BY m.created_at DESC
                 LIMIT 10`,
                [id],
                (error, rows) => {
                    if (error) {
                        return reject(error);
                    }

                    resolve(rows);
                }
            );
        });

        return Promise.all([topicsPromise, messagesPromise])
            .then(([topics, messages]) => ({ topics, messages }));
    }

    listMembers() {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT
                    g.id,
                    g.name,
                    g.role,
                    g.language,
                    g.created_at,
                    COALESCE(g.location, '') AS location,
                    COALESCE(g.bio, '') AS bio,
                    (
                        SELECT COUNT(*)
                        FROM discussion_topics t
                        WHERE t.author_id = g.id
                    ) AS topics_count,
                    (
                        SELECT COUNT(*)
                        FROM discussion_messages m
                        WHERE m.author_id = g.id
                    ) AS messages_count
                 FROM guests g
                 ORDER BY g.created_at ASC, g.id ASC`,
                [],
                (error, rows) => {
                    if (error) {
                        return reject(error);
                    }

                    resolve(rows);
                }
            );
        });
    }


  saveResetToken(email, token, expiresAt) {
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE guests
         SET reset_token = ?, reset_token_expires_at = ?
         WHERE email = ?`,
        [token, expiresAt, email],
        function (error) {
          if (error) return reject(error);
          resolve(this.changes > 0);
        }
      );
    });
  }

  findByResetToken(token) {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM guests
         WHERE reset_token = ?
           AND reset_token_expires_at > ?`,
        [token, Date.now()],
        (error, row) => {
          if (error) return reject(error);
          resolve(row);
        }
      );
    });
  }

  updatePassword(id, passwordHash) {
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE guests
         SET password_hash = ?,
             reset_token = NULL,
             reset_token_expires_at = NULL
         WHERE id = ?`,
        [passwordHash, id],
        function (error) {
          if (error) return reject(error);
          resolve(this.changes > 0);
        }
      );
    });
  }

}
export default new GuestRepository();
