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

    create(name, email, passwordHash) {
        return new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO guests (name, email, password_hash)
                 VALUES (?, ?, ?)`,
                [name, email, passwordHash],
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
                    notify_new_topics = ?
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
}

export default new GuestRepository();
