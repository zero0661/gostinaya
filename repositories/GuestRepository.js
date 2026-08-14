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
                    notify_new_topics,
                    notify_all_article_discussions,
                    notify_email,
                    is_blocked,
                    blocked_at,
                    blocked_reason,
                    email_verified_at
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
                `SELECT * FROM guests WHERE LOWER(email) = LOWER(?)`,
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

    create({
        name,
        email,
        passwordHash,
        location,
        language,
        country,
        city,
        joinReason,
        currentTopic
    }) {
        return new Promise((resolve, reject) => {
            db.run(
               `INSERT INTO guests (
                    name,
                    email,
                    password_hash,
                    location,
                    language,
                    country,
                    city,
                    join_reason,
                    current_topic,
                    rules_accepted_at,
                    privacy_accepted_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                [
                    name,
                    email,
                    passwordHash,
                    location,
                    language,
                    country,
                    city,
                    joinReason,
                    currentTopic
                ],
                function (err) {
                    if (err) {
                        return reject(err);
                    }

                    resolve({
                        id: this.lastID,
                        name,
                        email,
                        role: 'guest',
                        language
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
                    notify_all_article_discussions = ?,
                    notify_email = ?,
                    profile_completed = ?
                 WHERE id = ?`,
                [
                    settings.language,
                    settings.notifyReplies,
                    settings.notifyFollowedDiscussions,
                    settings.notifyPublications,
                    settings.notifyNewTopics,
                    settings.notifyAllArticleDiscussions,
                    settings.notifyEmail,
                    settings.profileCompleted,
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

    saveEmailVerificationToken(id, tokenHash, expiresAt, sentAt, resendBefore) {
        return new Promise((resolve, reject) => {
            db.run(
                `UPDATE guests
                 SET email_verification_token_hash = ?,
                     email_verification_expires_at = ?,
                     email_verification_sent_at = ?
                 WHERE id = ?
                   AND email_verified_at IS NULL
                   AND (
                     email_verification_sent_at IS NULL
                     OR email_verification_sent_at <= ?
                   )`,
                [tokenHash, expiresAt, sentAt, id, resendBefore],
                function (error) {
                    if (error) return reject(error);
                    resolve(this.changes > 0);
                }
            );
        });
    }

    clearEmailVerificationToken(id, tokenHash) {
        return new Promise((resolve, reject) => {
            db.run(
                `UPDATE guests
                 SET email_verification_token_hash = NULL,
                     email_verification_expires_at = NULL,
                     email_verification_sent_at = NULL
                 WHERE id = ?
                   AND email_verification_token_hash = ?
                   AND email_verified_at IS NULL`,
                [id, tokenHash],
                function (error) {
                    if (error) return reject(error);
                    resolve(this.changes > 0);
                }
            );
        });
    }

    consumeEmailVerificationToken(tokenHash, now) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT id
                 FROM guests
                 WHERE email_verification_token_hash = ?
                   AND email_verification_expires_at > ?
                   AND email_verified_at IS NULL`,
                [tokenHash, now],
                (findError, row) => {
                    if (findError) return reject(findError);
                    if (!row) return resolve(null);

                    const repository = this;
                    db.run(
                        `UPDATE guests
                         SET email_verified_at = CURRENT_TIMESTAMP,
                             email_verification_token_hash = NULL,
                             email_verification_expires_at = NULL
                         WHERE id = ?
                           AND email_verification_token_hash = ?
                           AND email_verified_at IS NULL`,
                        [row.id, tokenHash],
                        function (updateError) {
                            if (updateError) return reject(updateError);
                            if (!this.changes) return resolve(null);
                            repository.findById(row.id).then(resolve, reject);
                        }
                    );
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
           notify_all_article_discussions = ?,
           notify_email = ?,
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
          profile.notifyAllArticleDiscussions,
          profile.notifyEmail,
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
                        WHERE t.author_id = g.id AND t.hidden_at IS NULL
                    ) AS topics_count,
                    (
                        SELECT COUNT(*)
                        FROM discussion_messages m
                        WHERE m.author_id = g.id AND m.hidden_at IS NULL
                    ) AS messages_count
                 FROM guests g
                 WHERE g.id = ?
                   AND g.role IN ('guest', 'author', 'moderator')
                   AND COALESCE(g.is_blocked, 0) = 0
                   AND g.email_verified_at IS NOT NULL`,
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
                   AND hidden_at IS NULL
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
                   AND m.hidden_at IS NULL
                   AND t.hidden_at IS NULL
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
                        WHERE t.author_id = g.id AND t.hidden_at IS NULL
                    ) AS topics_count,
                    (
                        SELECT COUNT(*)
                        FROM discussion_messages m
                        WHERE m.author_id = g.id AND m.hidden_at IS NULL
                    ) AS messages_count
                 FROM guests g
                 WHERE g.role IN ('guest', 'author', 'moderator')
                   AND COALESCE(g.is_blocked, 0) = 0
                   AND g.email_verified_at IS NOT NULL
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

    listDiscussionParticipants(topicId) {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT DISTINCT
                    g.id,
                    g.email,
                    g.name,
                    g.language,
                    g.notify_replies,
                    g.notify_followed_discussions,
                    g.notify_publications,
                    g.notify_new_topics,
                    g.notify_all_article_discussions,
                    g.notify_email
                 FROM guests g
                 WHERE g.id IN (
                    SELECT author_id
                    FROM discussion_topics
                    WHERE id = ?
                    UNION
                    SELECT author_id
                    FROM discussion_messages
                    WHERE topic_id = ?
                 )
                   AND g.email_verified_at IS NOT NULL
                   AND COALESCE(g.is_blocked, 0) = 0`,
                [topicId, topicId],
                (error, rows) => {
                    if (error) return reject(error);
                    resolve(rows);
                }
            );
        });
    }

    listNotificationRecipients() {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT
                    id,
                    email,
                    name,
                    language,
                    notify_replies,
                    notify_followed_discussions,
                    notify_publications,
                    notify_new_topics,
                    notify_all_article_discussions,
                    notify_email
                 FROM guests
                 WHERE email_verified_at IS NOT NULL
                   AND COALESCE(is_blocked, 0) = 0`,
                [],
                (error, rows) => {
                    if (error) return reject(error);
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
