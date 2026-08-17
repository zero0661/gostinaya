import crypto from 'node:crypto';

const DEFAULT_TTL_MS = 60 * 60 * 1000;

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function hashPasswordResetToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

export class PasswordResetService {
  constructor({ guests, auth, mailer, appUrl, ttlMs = DEFAULT_TTL_MS, now = Date.now }) {
    this.guests = guests;
    this.auth = auth;
    this.mailer = mailer;
    this.appUrl = String(appUrl || 'https://milenin.pro').replace(/\/$/, '');
    this.ttlMs = ttlMs;
    this.now = now;
  }

  resetEmail({ guest, url }) {
    const en = guest.language === 'en';
    const subject = en
      ? 'Password recovery — The Lounge'
      : 'Восстановление пароля — Гостиная';
    const greeting = en ? `Hello, ${guest.name}.` : `Здравствуйте, ${guest.name}.`;
    const instruction = en
      ? 'Use the link below to create a new password.'
      : 'Перейдите по ссылке ниже, чтобы создать новый пароль.';
    const action = en ? 'Create a new password' : 'Создать новый пароль';
    const expiry = en ? 'The link is valid for 1 hour.' : 'Ссылка действует 1 час.';
    const ignore = en
      ? 'If you did not request a password reset, simply ignore this message.'
      : 'Если вы не запрашивали восстановление пароля, просто проигнорируйте это письмо.';

    return {
      subject,
      text: `${greeting}\n\n${instruction}\n\n${action}: ${url}\n\n${expiry}\n${ignore}`,
      html:
        `<p>${escapeHtml(greeting)}</p>` +
        `<p>${escapeHtml(instruction)}</p>` +
        `<p><a href="${escapeHtml(url)}">${escapeHtml(action)}</a></p>` +
        `<p>${escapeHtml(expiry)}</p>` +
        `<p>${escapeHtml(ignore)}</p>`
    };
  }

  async request(email) {
    const guest = await this.guests.findByEmail(email);
    if (!guest) return { sent: false, expiresAt: null };

    const issuedAt = this.now();
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashPasswordResetToken(token);
    const expiresAt = issuedAt + this.ttlMs;
    await this.guests.saveResetToken(guest.id, tokenHash, expiresAt);

    const query = new URLSearchParams({ token });
    const url = `${this.appUrl}/gostinaya/reset-password?${query.toString()}`;

    try {
      await this.mailer({
        to: guest.email,
        ...this.resetEmail({ guest, url })
      });
    } catch (error) {
      await this.guests.clearResetToken(guest.id, tokenHash);
      throw error;
    }

    return { sent: true, expiresAt };
  }

  async reset(token, password) {
    if (!/^[a-f0-9]{64}$/i.test(String(token || ''))) return false;

    const passwordHash = await this.auth.hashPassword(password);
    return this.guests.updatePasswordByResetToken(
      hashPasswordResetToken(token),
      this.now(),
      passwordHash
    );
  }
}
