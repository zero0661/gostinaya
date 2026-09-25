import crypto from 'crypto';
import TranslationRepository from '../repositories/TranslationRepository.js';

function detectLanguage(text) {
  const value = String(text || '');
  const cyrillic = (value.match(/[А-Яа-яЁё]/g) || []).length;
  const latin = (value.match(/[A-Za-z]/g) || []).length;

  if (cyrillic === 0 && latin === 0) return null;
  return cyrillic >= latin ? 'ru' : 'en';
}

function sourceHash(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

function extractResponseText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string' && content.text.trim()) {
        return content.text.trim();
      }
    }
  }

  return '';
}

async function requestTranslation(text, targetLang) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const targetName = targetLang === 'en' ? 'English' : 'Russian';
  const model = process.env.TRANSLATION_MODEL || 'gpt-5.4-mini';

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: `Translate the user's text into ${targetName}. Preserve meaning, tone, paragraph breaks, names, URLs, emoji and punctuation. Do not add explanations, notes or quotation marks. Return only the translation.`
            }
          ]
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text }]
        }
      ]
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`OpenAI translation failed (${response.status}): ${details.slice(0, 500)}`);
  }

  const payload = await response.json();
  const translated = extractResponseText(payload);

  if (!translated) {
    throw new Error('OpenAI returned an empty translation');
  }

  return translated;
}

async function translateEntity({ entityType, entityId, text, targetLang }) {
  const original = String(text || '');
  if (!original.trim()) return original;

  const sourceLang = detectLanguage(original);
  if (!sourceLang || sourceLang === targetLang) return original;

  const hash = sourceHash(original);
  const cached = await TranslationRepository.find({
    entityType,
    entityId,
    sourceHash: hash,
    targetLang
  });

  if (cached?.translated_text) return cached.translated_text;

  const translatedText = await requestTranslation(original, targetLang);

  await TranslationRepository.save({
    entityType,
    entityId,
    sourceHash: hash,
    sourceLang,
    targetLang,
    translatedText
  });

  return translatedText;
}

async function mapWithConcurrency(items, limit, worker) {
  const result = new Array(items.length);
  let cursor = 0;

  async function next() {
    while (cursor < items.length) {
      const index = cursor++;
      result[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next));
  return result;
}

export default {
  detectLanguage,

  async translateTopic({ topic, messages, targetLang }) {
    if (!['ru', 'en'].includes(targetLang)) {
      throw new Error('Unsupported target language');
    }

    let title = topic.title;

    if (topic.room === 'news') {
      const preparedTitle = targetLang === 'en' ? topic.title_en : topic.title_ru;
      if (preparedTitle) title = preparedTitle;
    } else {
      title = await translateEntity({
        entityType: 'topic',
        entityId: topic.id,
        text: topic.title,
        targetLang
      });
    }

    const visibleMessages = messages.filter(message => !message.hidden_at);

    const translatedMessages = await mapWithConcurrency(
      visibleMessages,
      3,
      async (message, index) => {
        let body = message.body;

        if (topic.room === 'news' && index === 0) {
          const preparedBody = targetLang === 'en' ? topic.body_en : topic.body_ru;
          if (preparedBody) body = preparedBody;
          else body = await translateEntity({
            entityType: 'message',
            entityId: message.id,
            text: message.body,
            targetLang
          });
        } else {
          body = await translateEntity({
            entityType: 'message',
            entityId: message.id,
            text: message.body,
            targetLang
          });
        }

        return { id: message.id, body };
      }
    );

    return {
      topic: { id: topic.id, title },
      messages: translatedMessages
    };
  }
};
