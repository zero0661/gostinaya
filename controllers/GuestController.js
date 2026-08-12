import GuestRepository from '../repositories/GuestRepository.js';
import AuthService from '../services/AuthService.js';
import crypto from 'crypto';
import { sendMail } from '../utils/mailer.js';
import {
    normalizeRegistrationInput,
    validateRegistrationInput
} from '../services/RegistrationService.js';

class GuestController {
    async register(req, res) {
        try {
            const input = normalizeRegistrationInput(req.body);
            const validationError = validateRegistrationInput(input);

            if (validationError) {
                return res.status(400).json({
                    error: validationError
                });
            }

            const existing = await GuestRepository.findByEmail(input.email);

            if (existing) {
                return res.status(409).json({
                    error: 'Этот e-mail уже зарегистрирован. / This e-mail is already registered.'
                });
            }

            const passwordHash = await AuthService.hashPassword(input.password);

            const guest = await GuestRepository.create({
                ...input,
                passwordHash
            });

            req.session.guest = {
                id: guest.id,
                name: guest.name,
                email: guest.email,
                role: guest.role,
                language: guest.language
            };

            await new Promise((resolve, reject) => {
                req.session.save((error) => error ? reject(error) : resolve());
            });

            return res.json({
                success: true,
                redirect: '/gostinaya/welcome'
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
            const email = String(req.body.email || '').trim().toLowerCase();
            const password = String(req.body.password || '');

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

            await new Promise((resolve, reject) => {
                req.session.save((error) => error ? reject(error) : resolve());
            });

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
