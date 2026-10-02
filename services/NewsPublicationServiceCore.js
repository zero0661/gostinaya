function requiredText(value, limit) {
  const text = String(value || '').trim();
  if (!text || text.length > limit) throw new Error('INVALID_NEWS_INPUT');
  return text;
}

export class NewsPublicationService {
  constructor({ translate, detectLanguage }) {
    this.translate = translate;
    this.detectLanguage = detectLanguage;
  }

  async prepare({ title, body, language, titleRu, titleEn, bodyRu, bodyEn }) {
    // Preserve complete submissions from an editor opened before the upgrade.
    if (!title && !body && titleRu && titleEn && bodyRu && bodyEn) {
      return {
        titleRu: requiredText(titleRu, 160), titleEn: requiredText(titleEn, 160),
        bodyRu: requiredText(bodyRu, 5000), bodyEn: requiredText(bodyEn, 5000)
      };
    }
    const originalTitle = requiredText(title || titleRu || titleEn, 160);
    const originalBody = requiredText(body || bodyRu || bodyEn, 5000);
    const source = this.detectLanguage(originalBody) || this.detectLanguage(originalTitle) ||
      (language === 'en' ? 'en' : 'ru');
    const target = source === 'en' ? 'ru' : 'en';
    const [translatedTitle, translatedBody] = await Promise.all([
      this.translate(originalTitle, target), this.translate(originalBody, target)
    ]);
    const versions = source === 'en'
      ? { titleEn: originalTitle, bodyEn: originalBody, titleRu: translatedTitle, bodyRu: translatedBody }
      : { titleRu: originalTitle, bodyRu: originalBody, titleEn: translatedTitle, bodyEn: translatedBody };
    // Do not publish incomplete translations or silently truncate them.
    for (const field of ['titleRu', 'titleEn', 'bodyRu', 'bodyEn']) {
      const value = String(versions[field] || '').trim();
      if (!value || value.length > (field.startsWith('title') ? 160 : 5000)) {
        throw new Error('INVALID_NEWS_TRANSLATION');
      }
      versions[field] = value;
    }
    return versions;
  }
}
