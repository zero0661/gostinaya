import GuestRepository from '../repositories/GuestRepository.js';
import AuthService from '../services/AuthService.js';
import crypto from 'crypto';
import { sendMail } from '../utils/mailer.js';

class GuestController {
    async register(req, res) {
        try {
            const { name, email, password, location, language } = req.body;

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
                passwordHash,
		location,
		language
            );

            req.session.guest = {
                id: guest.id,
                name: guest.name,
                email: guest.email,
                role: guest.role,
                language: guest.language
            };

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

  async requestPasswordReset(req, res) {
    try {
      const email = String(req.body.email || '').trim().toLowerCase();

      if (!email) {
        return res.status(400).json({
          message: 'Укажите e-mail'
        });
      }

      const guest = await GuestRepository.findByEmail(email);

      if (!guest) {
        return res.json({
          success: true,
          message: 'Если такой e-mail зарегистрирован, письмо будет отправлено'
        });
      }

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = Date.now() + 60 * 60 * 1000;

      await GuestRepository.saveResetToken(email, token, expiresAt);

      const resetUrl =
        `${process.env.APP_URL}/gostinaya/reset-password?token=${token}`;

      await sendMail({
        to: email,
        subject: 'Восстановление пароля — После логина',
        text:
          `Для создания нового пароля перейдите по ссылке:\n${resetUrl}\n\n` +
          'Ссылка действует 1 час.',
        html:
          `<h2>Восстановление пароля</h2>` +
          `<p>Для создания нового пароля перейдите по ссылке:</p>` +
          `<p><a href="${resetUrl}">Создать новый пароль</a></p>` +
          `<p>Ссылка действует 1 час.</p>`
      });

      return res.json({
        success: true,
        message: 'Если такой e-mail зарегистрирован, письмо будет отправлено'
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message: 'Не удалось отправить письмо'
      });
    }
  }
}

export default new GuestController();
