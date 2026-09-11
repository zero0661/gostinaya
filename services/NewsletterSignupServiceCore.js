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

  welcomeEmail({ email, language, unsubscribeUrl }) {
    const en = language === 'en';
    const subject = en ? 'Welcome to After Login' : 'Добро пожаловать в «После логина»';
    const heading = en ? 'Welcome!' : 'Добро пожаловать!';
    const thanks = en
      ? 'Thank you for subscribing to new publications from After Login.'
      : 'Спасибо, что подписались на новые публикации проекта «После логина».';
    const about = en
      ? 'I write about how technology and artificial intelligence are changing people, society, and the world we thought we understood. New essays are published approximately once every two weeks. No advertising and no unnecessary emails — only new publications.'
      : 'Я пишу о том, как технологии и искусственный интеллект меняют человека, общество и привычный нам мир. Новые материалы выходят примерно раз в две недели. Никакой рекламы и лишних писем — только новые публикации.';
    const lounge = en
      ? 'If you would like to do more than read, you are welcome to join the Lounge. It is a place to discuss the essays, disagree with the author, respond to other readers, and suggest questions of your own.'
      : 'Если вам захочется не только читать, но и обсуждать прочитанное, присоединяйтесь к Гостиной. Там можно спорить с автором, отвечать другим читателям и предлагать собственные темы.';
    const loungeAction = en ? 'Join the Lounge' : 'Зарегистрироваться в Гостиной';
    const goodbye = en ? 'Thank you for being here.' : 'Спасибо, что вы здесь.';
    const signature = en ? 'Peter Milenin\nAuthor of After Login' : 'Пётр Миленин\nАвтор проекта «После логина»';
    const unsubscribe = en ? 'Unsubscribe' : 'Отписаться';
    const loungeUrl = `${this.appUrl}/gostinaya/register`;
    const brand = en ? 'AFTER LOGIN' : 'ПОСЛЕ ЛОГИНА';
    const html = `<!doctype html>
<html lang="${en ? 'en' : 'ru'}">
<body style="margin:0;padding:0;background:#f4f1ed;color:#202027;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;padding:32px 18px;">
    <div style="margin:0 0 18px;color:#6941c6;font-size:14px;font-weight:700;letter-spacing:.12em;">&gt;_ ${escapeHtml(brand)}</div>
    <div style="background:#ffffff;border:1px solid #e7e1da;border-radius:18px;padding:34px 34px 30px;box-shadow:0 8px 28px rgba(32,32,39,.06);">
      <h1 style="margin:0 0 24px;font-family:Georgia,'Times New Roman',serif;font-size:38px;line-height:1.15;color:#202027;">${escapeHtml(heading)}</h1>
      <p style="margin:0 0 20px;font-size:17px;line-height:1.65;">${escapeHtml(thanks)}</p>
      <p style="margin:0 0 20px;font-size:17px;line-height:1.65;">${escapeHtml(about)}</p>
      <p style="margin:0 0 26px;font-size:17px;line-height:1.65;">${escapeHtml(lounge)}</p>
      <p style="margin:0 0 30px;"><a href="${escapeHtml(loungeUrl)}" style="display:inline-block;padding:13px 20px;border-radius:10px;background:#6941c6;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;">${escapeHtml(loungeAction)}</a></p>
      <p style="margin:0 0 22px;font-size:17px;line-height:1.65;">${escapeHtml(goodbye)}</p>
      <p style="margin:0;font-size:16px;line-height:1.55;"><strong>${escapeHtml(signature).replaceAll('\n', '</strong><br><span style="color:#67636d;">')}</span></p>
    </div>
    <p style="margin:18px 0 0;text-align:center;font-size:13px;line-height:1.5;color:#77727d;"><a href="${escapeHtml(unsubscribeUrl)}" style="color:#77727d;">${escapeHtml(unsubscribe)}</a></p>
  </div>
</body>
</html>`;

    return {
      to: email,
      subject,
      text: `${heading}\n\n${thanks}\n\n${about}\n\n${lounge}\n\n${loungeAction}: ${loungeUrl}\n\n${goodbye}\n\n${signature}\n\n${unsubscribe}: ${unsubscribeUrl}`,
      html,
      headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>` }
    };
  }

  async issue({ email, language, returnTo }) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) throw new Error('INVALID_EMAIL');
    const normalizedLanguage = language === 'en' ? 'en' : 'ru';
    const target = NEWSLETTERS[normalizedLanguage];
    const alreadySubscribed = await this.ghost.isMemberSubscribed({
      email: normalizedEmail,
      newsletterName: target.name
    });
    if (alreadySubscribed) {
      return { language: normalizedLanguage, status: 'already-subscribed' };
    }
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
    return { language: normalizedLanguage, status: 'confirmation-sent' };
  }

  async confirm(token) {
    const payload = await this.lookup(token, 'confirm');
    if (!payload) return null;
    const target = NEWSLETTERS[payload.language];
    const member = await this.ghost.subscribeMember({ email: payload.email, newsletterName: target.name, labelName: target.label });
    if (!member?.id) throw new Error('Ghost member ID missing after subscription');
    const unsubscribeUrl = await this.createUnsubscribeUrl({
      memberId: member.id,
      email: payload.email,
      language: payload.language
    });
    await this.mailer(this.welcomeEmail({
      email: payload.email,
      language: payload.language,
      unsubscribeUrl
    }));
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
