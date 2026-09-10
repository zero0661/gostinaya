import crypto from 'node:crypto';

const NEWSLETTERS = {
  ru: { name: 'После логина — RU', label: 'После логина RU' },
  en: { name: 'After Login — EN', label: 'After Login EN' }
};

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function normalizeReturnTo(value, language) {
  try {
    const url = new URL(String(value || ''), 'https://milenin.pro');
    if (url.origin !== 'https://milenin.pro') throw new Error('foreign origin');
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return language === 'en' ? '/en/' : '/';
  }
}

export class NewsletterSignupService {
  constructor({ ghost, mailer, tokens, appUrl = 'https://milenin.pro', ttlMs = 24 * 60 * 60 * 1000, now = Date.now }) {
    this.ghost = ghost;
    this.mailer = mailer;
    this.tokens = tokens;
    this.appUrl = String(appUrl).replace(/\/$/, '');
    this.ttlMs = ttlMs;
    this.now = now;
  }

  tokenHash(token) {
    return crypto.createHash('sha256').update(String(token || '')).digest('hex');
  }

  async lookup(token, action) {
    if (!/^[a-f0-9]{64}$/i.test(String(token || ''))) return null;
    const payload = await this.tokens.findValid(this.tokenHash(token), action, this.now());
    return payload && NEWSLETTERS[payload.language] ? payload : null;
  }

  confirmationEmail({ email, language, url }) {
    const en = language === 'en';
    const subject = en ? 'Confirm your subscription — After Login' : 'Подтвердите подписку — После логина';
    const opening = en ? 'Confirm your subscription to new After Login publications.' : 'Подтвердите подписку на новые публикации «После логина».';
    const action = en ? 'Confirm subscription' : 'Подтвердить подписку';
    const expiry = en ? 'The link is valid for 24 hours.' : 'Ссылка действует 24 часа.';
    const ignore = en ? 'If you did not request this, simply ignore the message.' : 'Если вы не запрашивали подписку, просто проигнорируйте письмо.';
    return {
      to: email,
      subject,
      text: `${opening}\n\n${action}: ${url}\n\n${expiry}\n${ignore}`,
      html: `<p>${escapeHtml(opening)}</p><p><a href="${escapeHtml(url)}">${escapeHtml(action)}</a></p><p>${escapeHtml(expiry)}</p><p>${escapeHtml(ignore)}</p>`
    };
  }

  async issue({ email, language, returnTo }) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) throw new Error('INVALID_EMAIL');
    const normalizedLanguage = language === 'en' ? 'en' : 'ru';
    const payload = {
      version: 1,
      action: 'confirm',
      email: normalizedEmail,
      language: normalizedLanguage,
      returnTo: normalizeReturnTo(returnTo, normalizedLanguage),
      expiresAt: this.now() + this.ttlMs,
      nonce: crypto.randomBytes(16).toString('hex')
    };
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.tokenHash(token);
    await this.tokens.create({ tokenHash, action: 'confirm', payload, expiresAt: payload.expiresAt });
    const url = `${this.appUrl}/gostinaya/newsletter/confirm?token=${encodeURIComponent(token)}`;
    try {
      await this.mailer(this.confirmationEmail({ email: normalizedEmail, language: normalizedLanguage, url }));
    } catch (error) {
      await this.tokens.remove(tokenHash);
      throw error;
    }
    return { language: normalizedLanguage };
  }

  async confirm(token) {
    const payload = await this.lookup(token, 'confirm');
    if (!payload) return null;
    const target = NEWSLETTERS[payload.language];
    const member = await this.ghost.subscribeMember({ email: payload.email, newsletterName: target.name, labelName: target.label });
    await this.tokens.remove(this.tokenHash(token));
    return { ...payload, member };
  }

  async createUnsubscribeUrl({ memberId, email, language }) {
    const normalizedLanguage = language === 'en' ? 'en' : 'ru';
    const payload = {
      version: 1,
      action: 'unsubscribe',
      memberId,
      email: String(email || '').trim().toLowerCase(),
      language: normalizedLanguage,
      expiresAt: this.now() + (365 * 24 * 60 * 60 * 1000)
    };
    const token = crypto.randomBytes(32).toString('hex');
    await this.tokens.create({ tokenHash: this.tokenHash(token), action: 'unsubscribe', payload, expiresAt: payload.expiresAt });
    return `${this.appUrl}/gostinaya/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
  }

  async previewUnsubscribe(token) {
    const payload = await this.lookup(token, 'unsubscribe');
    return payload?.memberId && payload.email ? payload : null;
  }

  async unsubscribe(token) {
    const payload = await this.previewUnsubscribe(token);
    if (!payload) return null;
    const target = NEWSLETTERS[payload.language];
    await this.ghost.unsubscribeMember({
      memberId: payload.memberId,
      email: payload.email,
      newsletterName: target.name
    });
    await this.tokens.remove(this.tokenHash(token));
    return payload;
  }
}

export { NEWSLETTERS };
