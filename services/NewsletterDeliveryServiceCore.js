import { newsletterLogoAttachment, newsletterLogoHeader } from '../utils/newsletterBrand.js';

const CHANNELS = {
  ru: { name: 'После логина — RU', key: 'ru' },
  en: { name: 'After Login — EN', key: 'en' }
};

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

export class NewsletterDeliveryService {
  constructor({ ghost, deliveries, mailer, unsubscribeUrl, logger = console }) {
    this.ghost = ghost;
    this.deliveries = deliveries;
    this.mailer = mailer;
    this.unsubscribeUrl = unsubscribeUrl;
    this.logger = logger;
  }

  publicationEmail({ language, title, url, excerpt, image, unsubscribeUrl }) {
    const en = language === 'en';
    const subject = en ? `New publication: ${title} — After Login` : `Новая публикация: ${title} — После логина`;
    const opening = en ? `A new article has been published: “${title}”.` : `Опубликована новая статья: «${title}».`;
    const action = en ? 'Read the article' : 'Прочитать статью';
    const unsubscribe = en ? 'Unsubscribe' : 'Отписаться';
    const footer = unsubscribeUrl ? `\n\n${unsubscribe}: ${unsubscribeUrl}` : '';
    const logo = newsletterLogoHeader(language);
    const teaser = excerpt ? `<p style="font-size:18px;line-height:1.6;margin:0 0 24px;">${escapeHtml(excerpt)}</p>` : '';
    let cover = '';
    try {
      if (['https:', 'http:'].includes(new URL(image).protocol)) {
        cover = `<a href="${escapeHtml(url)}"><img src="${escapeHtml(image)}" width="600" alt="${escapeHtml(title)}" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:12px;margin:0 0 24px;"></a>`;
      }
    } catch { /* Articles without a cover still have a title and teaser. */ }
    return {
      subject,
      text: `${opening}${excerpt ? `\n\n${excerpt}` : ''}\n\n${action}: ${url}${footer}`,
      html: `<div style="max-width:640px;margin:0 auto;padding:24px 16px;font-family:Arial,sans-serif;color:#202124;">${logo}<p style="font-size:14px;color:#666;">${en ? 'New article' : 'Новая статья'}</p>${cover}<h1 style="font-size:28px;line-height:1.3;margin:0 0 20px;">${escapeHtml(title)}</h1>${teaser}<p><a href="${escapeHtml(url)}" style="display:inline-block;background:#513496;color:#fff;padding:14px 22px;border-radius:8px;text-decoration:none;font-weight:bold;">${escapeHtml(action)}</a></p>${unsubscribeUrl ? `<p style="margin-top:32px;"><small><a href="${escapeHtml(unsubscribeUrl)}" style="color:#666;">${escapeHtml(unsubscribe)}</a></small></p>` : ''}</div>`,
      headers: unsubscribeUrl ? { 'List-Unsubscribe': `<${unsubscribeUrl}>` } : undefined,
      attachments: [newsletterLogoAttachment()]
    };
  }

  async deliverLanguage(publication, language) {
    const channel = CHANNELS[language];
    const url = language === 'en' ? publication.urlEn : publication.urlRu;
    const title = language === 'en' ? (publication.titleEn || publication.title) : (publication.titleRu || publication.title);
    if (!url || !title) return { language, sent: 0, skipped: 0, failed: 0 };

    const excerpt = language === 'en' ? publication.excerptEn : publication.excerptRu;
    const image = language === 'en' ? publication.imageEn : publication.imageRu;

    const members = await this.ghost.listNewsletterMembers(channel.name);
    const summary = { language, sent: 0, skipped: 0, failed: 0 };
    for (const member of members) {
      if (!member?.id || !member?.email) continue;
      const delivery = {
        deliveryKey: publication.deliveryKey,
        legacyDeliveryKeys: publication.legacyDeliveryKeys || [],
        newsletterSlug: channel.key,
        memberId: member.id
      };
      const claimed = await this.deliveries.claim({ ...delivery, email: member.email });
      if (!claimed) {
        summary.skipped += 1;
        continue;
      }
      try {
        const unsubscribeUrl = await this.unsubscribeUrl({ memberId: member.id, email: member.email, language });
        const info = await this.mailer({
          to: member.email,
          ...this.publicationEmail({
            language,
            title,
            url,
            excerpt,
            image,
            unsubscribeUrl
          })
        });
        await this.deliveries.markSent({ ...delivery, messageId: info?.messageId });
        summary.sent += 1;
      } catch (error) {
        await this.deliveries.markFailed({ ...delivery, error: error.message });
        this.logger.error(`Newsletter delivery failed for member ${member.id}:`, error);
        summary.failed += 1;
      }
    }
    return summary;
  }

  async deliverPublication(publication) {
    if (!publication?.deliveryKey) throw new Error('Newsletter publication deliveryKey is required');
    const results = [];
    if (publication.urlRu) results.push(await this.deliverLanguage(publication, 'ru'));
    if (publication.urlEn) results.push(await this.deliverLanguage(publication, 'en'));
    return { ok: results.every(item => item.failed === 0), results };
  }
}

export { CHANNELS };
