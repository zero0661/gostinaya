import db from '../database/db.js';

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) reject(error);
      else resolve(row || null);
    });
  });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (error) {
      if (error) reject(error);
      else resolve(this);
    });
  });
}

export default {
  async find({ entityType, entityId, sourceHash, targetLang }) {
    return get(
      `
      SELECT translated_text
      FROM discussion_translations
      WHERE entity_type = ?
        AND entity_id = ?
        AND source_hash = ?
        AND target_lang = ?
      LIMIT 1
      `,
      [entityType, entityId, sourceHash, targetLang]
    );
  },

  async save({ entityType, entityId, sourceHash, sourceLang, targetLang, translatedText }) {
    return run(
      `
      INSERT INTO discussion_translations
        (entity_type, entity_id, source_hash, source_lang, target_lang, translated_text)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(entity_type, entity_id, source_hash, target_lang)
      DO UPDATE SET
        source_lang = excluded.source_lang,
        translated_text = excluded.translated_text,
        updated_at = CURRENT_TIMESTAMP
      `,
      [entityType, entityId, sourceHash, sourceLang, targetLang, translatedText]
    );
  }
};
