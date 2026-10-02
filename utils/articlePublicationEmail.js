import { newsletterLogoAttachment, newsletterLogoHeader } from './newsletterBrand.js';

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

export function articlePublicationEmail({ language, title, url, excerpt, image, unsubscribeUrl, actionLabel, reason, footerLabel }) {
  const en = language === 'en';
  const subject = en ? `New publication: ${title} — After Login` : `Новая публикация: ${title} — После логина`;
  const opening = en ? `A new article has been published: “${title}”.` : `Опубликована новая статья: «${title}».`;
  const action = actionLabel || (en ? 'Read the article' : 'Прочитать статью');
  const unsubscribe = footerLabel || (en ? 'Unsubscribe' : 'Отписаться');
  const subscriptionReason = reason || (en
    ? 'You are receiving this email because you subscribed to the “After Login” project.'
    : 'Вы получаете это письмо, потому что подписаны на проект «После логина».');
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
    text: `${opening}${excerpt ? `\n\n${excerpt}` : ''}\n\n${action}: ${url}\n\n${subscriptionReason}${footer}`,
    html: `<div style="max-width:640px;margin:0 auto;padding:24px 16px;font-family:Arial,sans-serif;color:#202124;">${logo}<p style="font-size:14px;color:#666;">${en ? 'New article' : 'Новая статья'}</p>${cover}<h1 style="font-size:28px;line-height:1.3;margin:0 0 20px;">${escapeHtml(title)}</h1>${teaser}<p><a href="${escapeHtml(url)}" style="display:inline-block;background:#513496;color:#fff;padding:14px 22px;border-radius:8px;text-decoration:none;font-weight:bold;">${escapeHtml(action)}</a></p><p style="margin-top:32px;font-size:13px;line-height:1.5;color:#666;">${escapeHtml(subscriptionReason)}</p>${unsubscribeUrl ? `<p><small><a href="${escapeHtml(unsubscribeUrl)}" style="color:#666;">${escapeHtml(unsubscribe)}</a></small></p>` : ''}</div>`,
    headers: unsubscribeUrl ? { 'List-Unsubscribe': `<${unsubscribeUrl}>` } : undefined,
    attachments: [newsletterLogoAttachment()]
  };
}

