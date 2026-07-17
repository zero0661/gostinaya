import GuestRepository from '../repositories/GuestRepository.js';
import AuthService from '../services/AuthService.js';

class GuestController {
    async register(req, res) {
        try {
            const { name, email, password } = req.body;

            if (!name || !email || !password) {
                return res.status(400).json({
                    error: 'Name, email and password are required'
                });
            }

            const existing = await GuestRepository.findByEmail(email);

            if (existing) {
                return res.json({
                    success: true,
                    guest: existing,
                    message: 'Guest already exists'
                });
            }

            const passwordHash = await AuthService.hashPassword(password);

            const guest = await GuestRepository.create(
                name,
                email,
                passwordHash
            );

            return res.json({
                success: true,
                guest,
                redirect: '/gostinaya/hall'
            });
        } catch (err) {
            console.error(err);

            return res.status(500).json({
                error: 'Internal server error'
            });
        }
    }

    async login(req, res) {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({
                    message: 'E-mail и пароль обязательны'
                });
            }

            const guest = await GuestRepository.findByEmail(email);

            if (!guest) {
                return res.status(401).json({
                    message: 'Неверный e-mail или пароль'
                });
            }

            const passwordIsValid = await AuthService.verifyPassword(
                password,
                guest.password_hash
            );

            if (!passwordIsValid) {
                return res.status(401).json({
                    message: 'Неверный e-mail или пароль'
                });
            }

            req.session.guest = {
                id: guest.id,
                name: guest.name,
                email: guest.email,
                role: guest.role,
                language: guest.language
            };

            return res.json({
                success: true,
                redirect: '/gostinaya/hall'
            });
        } catch (err) {
            console.error(err);

            return res.status(500).json({
                message: 'Внутренняя ошибка сервера'
            });
        }
    }
}

export default new GuestController();
