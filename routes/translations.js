import express from 'express';
import DiscussionRepository from '../repositories/DiscussionRepository.js';
import DiscussionTranslationService from '../services/DiscussionTranslationService.js';

const router = express.Router();

router.get('/topic/:id', async (req, res) => {
  if (!req.session?.guest?.id) {
    return res.status(401).json({ ok: false, error: 'authentication-required' });
  }

  const targetLang = req.query.lang === 'en' ? 'en' : req.query.lang === 'ru' ? 'ru' : null;
  if (!targetLang) {
    return res.status(400).json({ ok: false, error: 'unsupported-language' });
  }

  try {
    const topic = await DiscussionRepository.getTopic(req.params.id);
    if (!topic) {
      return res.status(404).json({ ok: false, error: 'topic-not-found' });
    }

    const messages = await DiscussionRepository.listMessages(topic.id);
    const translation = await DiscussionTranslationService.translateTopic({
      topic,
      messages,
      targetLang
    });

    res.set('Cache-Control', 'no-store');
    return res.json({
      ok: true,
      lang: targetLang,
      ...translation
    });
  } catch (error) {
    console.error('Discussion translation error:', error);
    return res.status(502).json({
      ok: false,
      error: 'translation-failed'
    });
  }
});

export default router;
