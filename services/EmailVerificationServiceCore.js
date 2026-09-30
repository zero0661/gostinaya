import crypto from 'node:crypto';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RESEND_COOLDOWN_MS = 60 * 1000;

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function hashVerificationToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

export class EmailVerificationService {
  constructor({ guests, mailer, appUrl, ttlMs = DEFAULT_TTL_MS, resendCooldownMs = DEFAULT_RESEND_COOLDOWN_MS, now = Date.now }) {
    this.guests = guests;
    this.mailer = mailer;
    this.appUrl = String(appUrl || 'https://milenin.pro').replace(/\/$/, '');
    this.ttlMs = ttlMs;
    this.resendCooldownMs = resendCooldownMs;
    this.now = now;
  }

  verificationEmail({ guest, url }) {
    const subject = 'Вход в Гостиную / Sign in to the Lounge';
    const greeting = `Здравствуйте / Hello, ${guest.name}.`;
    const instruction = 'Перейдите по ссылке, чтобы войти в Гостиную и подтвердить e-mail. / Follow the link to sign in to the Lounge and confirm your e-mail.';
    const action = 'Войти / Sign in';
    const expiry = 'Ссылка действует 24 часа и используется один раз. / The link is valid for 24 hours and can be used once.';
    const ignore = 'Если вы не запрашивали вход, проигнорируйте письмо. / If you did not request sign-in, ignore this message.';

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

  async issue(guest, returnTo = '') {
    if (Number(guest.is_blocked) === 1) return { sent: false, expiresAt: null };
    const issuedAt = this.now();
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashVerificationToken(token);
    const expiresAt = issuedAt + this.ttlMs;
    const saved = await this.guests.saveEmailVerificationToken(
      guest.id,
      tokenHash,
      expiresAt,
      issuedAt,
      issuedAt - this.resendCooldownMs
    );
    if (!saved) return { sent: false, expiresAt: null };

    const query = new URLSearchParams({ token });
    if (returnTo) query.set('returnTo', returnTo);
    const url = `${this.appUrl}/gostinaya/verify-email?${query.toString()}`;

    try {
      await this.mailer({
        to: guest.email,
        ...this.verificationEmail({ guest, url })
      });
    } catch (error) {
      await this.guests.clearEmailVerificationToken(guest.id, tokenHash);
      throw error;
    }

    return { sent: true, expiresAt };
  }

  async verify(token) {
    if (!/^[a-f0-9]{64}$/i.test(String(token || ''))) return null;
    return this.guests.consumeEmailVerificationToken(
      hashVerificationToken(token),
      this.now()
    );
  }
}
