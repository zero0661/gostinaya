import express from 'express';
import DiscussionRepository from '../repositories/DiscussionRepository.js';
import ModerationRepository from '../repositories/ModerationRepository.js';
import requireGuest from '../middleware/requireGuest.js';
import { normalizeModerationReason } from '../services/ModerationPolicy.js';

const router = express.Router();

router.post('/', requireGuest, async (req, res, next) => {
  try {
    const topicId = Number(req.body.topic_id || 0) || null;
    const messageId = Number(req.body.message_id || 0) || null;
    const reason = normalizeModerationReason(req.body.reason);
    if (!reason || (!topicId && !messageId)) {
      return res.status(400).send('Укажите объект и причину жалобы / Give a target and reason');
    }

    let targetTopicId = topicId;
    if (messageId) {
      const message = await DiscussionRepository.getMessage(messageId);
      if (!message) return res.status(404).send('Сообщение не найдено / Message not found');
      targetTopicId = Number(message.topic_id);
      if (topicId && Number(topicId) !== targetTopicId) {
        return res.status(400).send('Сообщение не относится к теме / Message does not belong to topic');
      }
    }
    const topic = await DiscussionRepository.getTopic(targetTopicId);
    if (!topic) return res.status(404).send('Тема не найдена / Topic not found');

    await ModerationRepository.createReport({
      reporterId: req.session.guest.id,
      topicId: messageId ? null : targetTopicId,
      messageId,
      reason
    });
    return res.redirect(`/gostinaya/topic/${targetTopicId}?reported=1${messageId ? `#message-${messageId}` : ''}`);
  } catch (error) {
    next(error);
  }
});

export default router;
