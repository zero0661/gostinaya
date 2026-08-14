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

  publicationEmail({ recipient, title, url }) {
    const en = recipient.language === 'en';
    const subject = en
      ? `New publication: ${title} — After Login`
      : `Новая публикация: ${title} — После логина`;
    const opening = en
      ? `A new article has been published: “${title}”.`
      : `Опубликована новая статья: «${title}».`;
    const linkText = en ? 'Read and discuss' : 'Прочитать и обсудить';
    return {
      subject,
      text: `${opening}\n\n${linkText}: ${url}`,
      html: `<p>${escapeHtml(opening)}</p><p><a href="${escapeHtml(url)}">${linkText}</a></p>`
    };
  }

  async notifyPublication({ topicId, actorId, title, titleRu, titleEn, urlRu, urlEn }) {
    const recipients = await this.guests.listNotificationRecipients();
    for (const recipient of recipients) {
      if (Number(recipient.id) === Number(actorId)) continue;
      if (Number(recipient.notify_publications) !== 1) continue;
      const articleUrl = recipient.language === 'en' ? (urlEn || urlRu) : (urlRu || urlEn);
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
          url: articleUrl || this.topicUrl(topicId)
        }));
      }
    }
  }

  newTopicEmail({ recipient, actorName, title, url }) {
    const en = recipient.language === 'en';
    const subject = en ? `New Lounge topic: ${title}` : `Новая тема в Гостиной: ${title}`;
    const opening = en
      ? `${actorName} started a new Lounge topic: “${title}”.`
      : `${actorName} открыл новую тему в Гостиной: «${title}».`;
    const linkText = en ? 'Open the topic' : 'Открыть тему';
    return {
      subject,
      text: `${opening}\n\n${linkText}: ${url}`,
      html: `<p>${escapeHtml(opening)}</p><p><a href="${escapeHtml(url)}">${linkText}</a></p>`
    };
  }

  async notifyNewTopic({ topicId, actor, title }) {
    const recipients = await this.guests.listNotificationRecipients();
    const url = this.topicUrl(topicId);
    for (const recipient of recipients) {
      if (Number(recipient.id) === Number(actor.id)) continue;
      if (Number(recipient.notify_new_topics) !== 1) continue;
      await this.notifications.create({
        recipientId: recipient.id,
        actorId: actor.id,
        type: 'new_topic',
        topicId,
        text: 'создал новую тему / started a new topic'
      });
      if (Number(recipient.notify_email) === 1) {
        void this.deliverEmail(recipient, this.newTopicEmail({
          recipient,
          actorName: actor.name,
          title,
          url
        }));
      }
    }
  }
}
