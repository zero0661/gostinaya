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
    const en = guest.language === 'en';
    const subject = en
      ? 'Confirm your e-mail — The Lounge'
      : 'Подтвердите e-mail — Гостиная';
    const greeting = en ? `Hello, ${guest.name}.` : `Здравствуйте, ${guest.name}.`;
    const instruction = en
      ? 'Confirm your e-mail address to open the door to The Lounge.'
      : 'Подтвердите адрес электронной почты, чтобы открыть дверь в Гостиную.';
    const action = en ? 'Confirm e-mail' : 'Подтвердить e-mail';
    const expiry = en
      ? 'The link is valid for 24 hours.'
      : 'Ссылка действует 24 часа.';
    const ignore = en
      ? 'If you did not request this registration, simply ignore this message.'
      : 'Если вы не регистрировались, просто проигнорируйте это письмо.';

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
