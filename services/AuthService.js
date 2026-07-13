import bcrypt from 'bcrypt';

class AuthService {
    async hashPassword(password) {
        return bcrypt.hash(password, 12);
    }

    async verifyPassword(password, passwordHash) {
        return bcrypt.compare(password, passwordHash);
    }
}

export default new AuthService();
