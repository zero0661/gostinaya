import db from '../database/db.js';

class GuestRepository {
    findByEmail(email) {
        return new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM guests WHERE email = ?',
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
}

export default new GuestRepository();
