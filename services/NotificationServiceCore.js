import { articlePublicationEmail } from '../utils/articlePublicationEmail.js';
import { newsletterLogoAttachment, newsletterLogoHeader } from '../utils/newsletterBrand.js';

const APP_URL = String(process.env.APP_URL || 'https://milenin.pro').replace(/\/$/, '');

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function excerpt(value, limit = 220) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  return clean.length > limit ? `${clean.slice(0, limit - 1)}…` : clean;
}

export class NotificationService {
  constructor({ guests, notifications, mailer, logger = console }) {
    this.guests = guests;
    this.notifications = notifications;
    this.mailer = mailer;
    this.logger = logger;
  }

  async deliverEmail(recipient, message) {
    if (!recipient?.email || !message) return;
    try {
      await this.mailer({ to: recipient.email, ...message });
    } catch (error) {
      this.logger.error(`Notification email failed for guest ${recipient.id}:`, error);
    }
  }

  topicUrl(topicId, messageId = null) {
    return `${APP_URL}/gostinaya/topic/${topicId}${messageId ? `#message-${messageId}` : ''}`;
  }

  replyEmail({ recipient, actorName, topicTitle, body, url, reason }) {
    const en = recipient.language === 'en';
    const action = reason === 'reply'
      ? (en ? 'replied to your message' : 'ответил на ваше сообщение')
      : reason === 'article_discussion'
        ? (en ? 'posted in an article discussion' : 'написал в обсуждении статьи')
        : (en ? 'posted in a discussion you follow' : 'написал в обсуждении, за которым вы следите');
    const subject = en
      ? `${actorName} ${action} — After Login`
      : `${actorName} ${action} — После логина`;
    const opening = en
      ? `${actorName} ${action} in “${topicTitle}”.`
      : `${actorName} ${action} «${topicTitle}».`;
    const linkText = en ? 'Open the discussion' : 'Открыть обсуждение';
    return {
      subject,
      text: `${opening}\n\n${excerpt(body)}\n\n${linkText}: ${url}`,
      html: `<p>${escapeHtml(opening)}</p><blockquote>${escapeHtml(excerpt(body))}</blockquote><p><a href="${escapeHtml(url)}">${linkText}</a></p>`
    };
  }

  async notifyMessage({ topic, messageId, body, actor, parentAuthorId = null }) {
    const participants = await this.guests.listDiscussionParticipants(topic.id);
    const participantIds = new Set(participants.map(item => Number(item.id)));
    const recipients = new Map(participants.map(item => [Number(item.id), item]));
    const actorId = Number(actor.id);
    const directId = parentAuthorId && Number(parentAuthorId) !== actorId
      ? Number(parentAuthorId)
      : null;

    if (topic.room === 'articles') {
      const allRecipients = await this.guests.listNotificationRecipients();
      for (const recipient of allRecipients) {
        if (Number(recipient.notify_all_article_discussions) === 1) {
          recipients.set(Number(recipient.id), recipient);
        }
      }
    }

    if (directId && !recipients.has(directId)) {
      const directRecipient = await this.guests.findById(directId);
      if (directRecipient) recipients.set(directId, directRecipient);
    }

    recipients.delete(actorId);

    const url = this.topicUrl(topic.id, messageId);
    for (const recipient of recipients.values()) {
      const recipientId = Number(recipient.id);
      const wantsReply = recipientId === directId && Number(recipient.notify_replies) === 1;
      const wantsFollowed = participantIds.has(recipientId) &&
        Number(recipient.notify_followed_discussions) === 1;
      const wantsAllArticles = topic.room === 'articles' &&
        Number(recipient.notify_all_article_discussions) === 1;
      const reason = wantsReply
        ? 'reply'
        : wantsFollowed
          ? 'followed_discussion'
          : wantsAllArticles
            ? 'article_discussion'
            : null;

      if (!reason) continue;

      await this.notifications.create({
        recipientId: recipient.id,
        actorId,
        type: reason,
        topicId: topic.id,
        messageId,
        text: reason === 'reply'
          ? 'ответил на ваше сообщение / replied to your message'
          : reason === 'article_discussion'
            ? 'написал в обсуждении статьи / posted in an article discussion'
            : 'написал в обсуждении, за которым вы следите / posted in a discussion you follow'
      });
      if (Number(recipient.notify_email) === 1) {
        void this.deliverEmail(recipient, this.replyEmail({
          recipient,
          actorName: actor.name,
          topicTitle: topic.title,
          body,
          url,
          reason
        }));
      }
    }
  }

  publicationEmail({ recipient, title, url, excerpt, image }) {
    const en = recipient.language === 'en';
    const destination = new URL(url);
    destination.searchParams.set('lang', en ? 'en' : 'ru');
    const mail = articlePublicationEmail({
      language: en ? 'en' : 'ru', title, url: destination.href, excerpt, image,
      actionLabel: en ? 'Read and discuss' : 'Прочитать и обсудить',
      reason: en
        ? 'You are receiving this email because you enabled new article notifications in the Lounge of the “After Login” project.'
        : 'Вы получаете это письмо, потому что включили уведомления о новых статьях в Гостиной проекта «После логина».',
      unsubscribeUrl: `${APP_URL}/gostinaya/profile`,
      footerLabel: en ? 'Notification settings' : 'Настройки уведомлений'
    });
    // The profile requires sign-in and is a settings page, not an unsubscribe endpoint.
    delete mail.headers;
    return mail;
  }

  async notifyPublication({ topicId, actorId, title, titleRu, titleEn, urlRu, urlEn, excerptRu, excerptEn, imageRu, imageEn }) {
    const recipients = await this.guests.listNotificationRecipients();
    for (const recipient of recipients) {
      if (Number(recipient.id) === Number(actorId)) continue;
      if (Number(recipient.notify_publications) !== 1) continue;
      const useEnglish = recipient.language === 'en' && Boolean(urlEn);
      const articleExcerpt = useEnglish ? excerptEn : (urlRu ? excerptRu : excerptEn);
      const articleImage = useEnglish ? imageEn : (urlRu ? imageRu : imageEn);
      const localizedTitle = recipient.language === 'en' ? (titleEn || title) : (titleRu || title);
      await this.notifications.create({
        recipientId: recipient.id,
        actorId,
        type: 'publication',
        topicId,
        text: 'опубликовал новую статью / published a new article'
      });
      if (Number(recipient.notify_email) === 1) {
        void this.deliverEmail(recipient, this.publicationEmail({
          recipient,
          title: localizedTitle,
          url: this.topicUrl(topicId),
          excerpt: articleExcerpt,
          image: articleImage
        }));
      }
    }
  }

  newTopicEmail({ recipient, actorName, title, body, url, room = 'discussions' }) {
    const en = recipient.language === 'en';
    const isProjectNews = room === 'news';
    const subject = isProjectNews
      ? (en ? `Project news: ${title}` : `Новость проекта: ${title}`)
      : (en ? `New Lounge topic: ${title}` : `Новая тема в Гостиной: ${title}`);
    const opening = isProjectNews
      ? (en
          ? `${actorName} published project news: “${title}”.`
          : `${actorName} опубликовал новость проекта: «${title}».`)
      : (en
          ? `${actorName} started a new Lounge topic: “${title}”.`
          : `${actorName} открыл новую тему в Гостиной: «${title}».`);
    const linkText = en ? 'View on the website and discuss' : 'Посмотреть на сайте и обсудить';
    const content = String(body || '').trim();
    const contentHtml = content.split(/\r?\n\s*\r?\n/)
      .map(paragraph => `<p style="font-size:18px;line-height:1.6;overflow-wrap:break-word;">${escapeHtml(paragraph).replace(/\r?\n/g, '<br>')}</p>`).join('');
    const reason = en
      ? 'You are receiving this email because you enabled notifications about new topics and project news in the Lounge of the “After Login” project.'
      : 'Вы получаете это письмо, потому что включили уведомления о новых темах и новостях проекта в Гостиной проекта «После логина».';
    const settingsUrl = `${APP_URL}/gostinaya/profile`;
    const settingsLabel = en ? 'Notification settings' : 'Настройки уведомлений';
    return {
      subject,
      text: `${opening}\n\n${content}\n\n${linkText}: ${url}\n\n${reason}\n\n${settingsLabel}: ${settingsUrl}`,
      html: `<div style="max-width:640px;margin:0 auto;padding:24px 16px;font-family:Arial,sans-serif;color:#202124;">${newsletterLogoHeader(en ? 'en' : 'ru')}<p style="font-size:14px;color:#666;">${escapeHtml(opening)}</p><h1 style="font-size:28px;line-height:1.3;">${escapeHtml(title)}</h1>${contentHtml}<p><a href="${escapeHtml(url)}" style="display:inline-block;background:#513496;color:#fff;padding:14px 22px;border-radius:8px;text-decoration:none;font-weight:bold;">${escapeHtml(linkText)}</a></p><p style="margin-top:32px;font-size:13px;line-height:1.5;color:#666;">${escapeHtml(reason)}</p><p><small><a href="${escapeHtml(settingsUrl)}" style="color:#666;">${escapeHtml(settingsLabel)}</a></small></p></div>`,
      attachments: [newsletterLogoAttachment()]
    };
  }

  async notifyNewTopic({ topicId, actor, title, body, titleRu, titleEn, bodyRu, bodyEn, room = 'discussions' }) {
    const recipients = await this.guests.listNotificationRecipients();
    const url = this.topicUrl(topicId);
    for (const recipient of recipients) {
      if (Number(recipient.id) === Number(actor.id)) continue;
      if (Number(recipient.notify_new_topics) !== 1) continue;
      await this.notifications.create({
        recipientId: recipient.id,
        actorId: actor.id,
        type: room === 'news' ? 'project_news' : 'new_topic',
        topicId,
        text: room === 'news'
          ? 'опубликовал новость проекта / published project news'
          : 'создал новую тему / started a new topic'
      });
      if (Number(recipient.notify_email) === 1) {
        void this.deliverEmail(recipient, this.newTopicEmail({
          recipient,
          actorName: actor.name,
          title: recipient.language === 'en' ? (titleEn || title) : (titleRu || title),
          body: recipient.language === 'en' ? (bodyEn || body) : (bodyRu || body),
          url,
          room
        }));
      }
    }
  }
}
