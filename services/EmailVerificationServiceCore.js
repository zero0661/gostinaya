import crypto from 'node:crypto';
import { newsletterLogoAttachment } from '../utils/newsletterBrand.js';

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
    const subject = 'After Login: Sign in to the Lounge · Вход в Гостиную';
    const en = {
      title: 'Sign in to the Lounge',
      greeting: `Hello, ${guest.name}.`,
      instruction: 'Follow the link to sign in to the Lounge and confirm your e-mail.',
      action: 'Sign in',
      expiry: 'The link is valid for 24 hours and can be used once.',
      ignore: 'If you did not request sign-in, ignore this message.'
    };
    const ru = {
      title: 'Вход в Гостиную',
      greeting: `Здравствуйте, ${guest.name}.`,
      instruction: 'Перейдите по ссылке, чтобы войти в Гостиную и подтвердить e-mail.',
      action: 'Войти',
      expiry: 'Ссылка действует 24 часа и используется один раз.',
      ignore: 'Если вы не запрашивали вход, проигнорируйте письмо.'
    };
    const textBlock = (copy) => `${copy.title}\n\n${copy.greeting}\n\n${copy.instruction}\n\n${copy.action}: ${url}\n\n${copy.expiry}\n${copy.ignore}`;
    const htmlBlock = (copy, language) => `<div lang="${language}">` +
      `<h2 style="font-size:22px;margin:0 0 20px;">${copy.title}</h2>` +
      `<p>${escapeHtml(copy.greeting)}</p><p>${copy.instruction}</p>` +
      `<p style="margin:24px 0;"><a href="${escapeHtml(url)}" style="display:inline-block;background:#087b96;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">${copy.action}</a></p>` +
      `<p>${copy.expiry}</p><p style="font-size:13px;">${copy.ignore}</p></div>`;

    return {
      subject,
      text: `AFTER LOGIN\n\n${textBlock(en)}\n\n————————————\n\n${textBlock(ru)}`,
      html: '<!doctype html><html><body><div style="max-width:560px;margin:0 auto;padding:24px;font-family:Arial,sans-serif;line-height:1.6;">' +
        '<div style="margin:0 0 28px;"><img src="cid:after-login-logo" width="240" alt="After Login" style="display:block;width:240px;max-width:100%;height:auto;border:0;"></div>' +
        htmlBlock(en, 'en') +
        '<hr style="border:0;border-top:1px solid #cccccc;margin:32px 0;">' +
        htmlBlock(ru, 'ru') + '</div></body></html>',
      attachments: [newsletterLogoAttachment()]
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
