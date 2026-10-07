import { articlePublicationEmail } from '../utils/articlePublicationEmail.js';

const CHANNELS = {
  ru: { name: 'После логина — RU', key: 'ru' },
  en: { name: 'After Login — EN', key: 'en' }
};

export class NewsletterDeliveryService {
  constructor({ ghost, deliveries, mailer, unsubscribeUrl, canDeliver = async () => true, logger = console }) {
    this.ghost = ghost;
    this.canDeliver = canDeliver;
    this.deliveries = deliveries;
    this.mailer = mailer;
    this.unsubscribeUrl = unsubscribeUrl;
    this.logger = logger;
  }

  publicationEmail(options) {
    return articlePublicationEmail(options);
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
      if (!await this.canDeliver(member.email, language)) {
        summary.skipped += 1;
        continue;
      }
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
