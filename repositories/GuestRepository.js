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
}

export default new GuestRepository();
