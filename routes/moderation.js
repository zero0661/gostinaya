import express from 'express';
import ModerationRepository from '../repositories/ModerationRepository.js';
import requireModerator from '../middleware/requireModerator.js';
import {
  assignableRoles,
  canAssignRole,
  canManageAccount,
  normalizeModerationReason
} from '../services/ModerationPolicy.js';

const router = express.Router();
const reportStatuses = new Set(['open', 'resolved', 'dismissed']);
const roomKeys = new Set(['', 'articles', 'news', 'discussions']);

router.use(requireModerator);

router.get('/', async (req, res, next) => {
  try {
    const dashboard = await ModerationRepository.dashboard();
    res.render('moderation/dashboard', {
      title: 'Модерация',
      dashboard,
      saved: req.query.saved || ''
    });
  } catch (error) {
    next(error);
  }
});

router.get('/accounts', async (req, res, next) => {
  try {
    const search = String(req.query.q || '').trim().slice(0, 120);
    const accounts = await ModerationRepository.listAccounts(search);
    res.render('moderation/accounts', {
      title: 'Аккаунты',
      accounts,
      search,
      assignableRoles,
      saved: req.query.saved || ''
    });
  } catch (error) {
    next(error);
  }
});

router.post('/accounts/:id/block', async (req, res, next) => {
  try {
    const target = await ModerationRepository.getAccount(req.params.id);
    if (!target) return res.status(404).send('Аккаунт не найден');
    if (!canManageAccount(req.session.guest, target)) {
      return res.status(403).send('Этим аккаунтом управлять нельзя');
    }
    const reason = normalizeModerationReason(req.body.reason);
    if (!reason) return res.status(400).send('Укажите причину блокировки');
    await ModerationRepository.setAccountBlocked(target.id, true, req.session.guest.id, reason);
    await ModerationRepository.recordAction({
      actor: req.session.guest,
      action: 'account_blocked',
      targetType: 'account',
      targetId: target.id,
      details: `${target.email}: ${reason}`
    });
    return res.redirect('/gostinaya/moderation/accounts?saved=blocked');
  } catch (error) {
    next(error);
  }
});

router.post('/accounts/:id/unblock', async (req, res, next) => {
  try {
    const target = await ModerationRepository.getAccount(req.params.id);
    if (!target) return res.status(404).send('Аккаунт не найден');
    if (!canManageAccount(req.session.guest, target)) {
      return res.status(403).send('Этим аккаунтом управлять нельзя');
    }
    await ModerationRepository.setAccountBlocked(target.id, false, req.session.guest.id);
    await ModerationRepository.recordAction({
      actor: req.session.guest,
      action: 'account_unblocked',
      targetType: 'account',
      targetId: target.id,
      details: target.email
    });
    return res.redirect('/gostinaya/moderation/accounts?saved=unblocked');
  } catch (error) {
    next(error);
  }
});

router.post('/accounts/:id/role', async (req, res, next) => {
  try {
    const role = String(req.body.role || '').trim().toLowerCase();
    const target = await ModerationRepository.getAccount(req.params.id);
    if (!target) return res.status(404).send('Аккаунт не найден');
    if (!canAssignRole(req.session.guest, target, role)) {
      return res.status(403).send('Недостаточно прав для изменения роли');
    }
    await ModerationRepository.setAccountRole(target.id, role);
    await ModerationRepository.recordAction({
      actor: req.session.guest,
      action: 'account_role_changed',
      targetType: 'account',
      targetId: target.id,
      details: `${target.email}: ${target.role} -> ${role}`
    });
    return res.redirect('/gostinaya/moderation/accounts?saved=role');
  } catch (error) {
    next(error);
  }
});

router.get('/discussions', async (req, res, next) => {
  try {
    const search = String(req.query.q || '').trim().slice(0, 160);
    const requestedRoom = String(req.query.room || '');
    const room = roomKeys.has(requestedRoom) ? requestedRoom : '';
    const topics = await ModerationRepository.listTopics({ search, room });
    res.render('moderation/discussions', {
      title: 'Обсуждения',
      topics,
      search,
      room,
      saved: req.query.saved || ''
    });
  } catch (error) {
    next(error);
  }
});

router.get('/discussions/:id', async (req, res, next) => {
  try {
    const topic = await ModerationRepository.getTopic(req.params.id);
    if (!topic) return res.status(404).send('Тема не найдена');
    const messages = await ModerationRepository.listTopicMessages(topic.id);
    res.render('moderation/discussion', {
      title: 'Управление обсуждением',
      topic,
      messages,
      saved: req.query.saved || ''
    });
  } catch (error) {
    next(error);
  }
});

router.post('/topics/:id/:action', async (req, res, next) => {
  try {
    const topic = await ModerationRepository.getTopic(req.params.id);
    if (!topic) return res.status(404).send('Тема не найдена');
    const actions = {
      pin: ['pinned', true, 'topic_pinned'],
      unpin: ['pinned', false, 'topic_unpinned'],
      close: ['closed', true, 'topic_closed'],
      reopen: ['closed', false, 'topic_reopened'],
      hide: ['hidden', true, 'topic_hidden'],
      restore: ['hidden', false, 'topic_restored']
    };
    const selected = actions[req.params.action];
    if (!selected) return res.status(404).send('Неизвестное действие');
    const [field, enabled, action] = selected;
    const reason = normalizeModerationReason(req.body.reason);
    if (field === 'hidden' && enabled && !reason) {
      return res.status(400).send('Укажите причину скрытия');
    }
    await ModerationRepository.setTopicFlag(topic.id, field, enabled, req.session.guest.id, reason);
    await ModerationRepository.recordAction({
      actor: req.session.guest,
      action,
      targetType: 'topic',
      targetId: topic.id,
      details: reason
        ? `Причина: ${reason} · Тема: ${topic.title}`
        : `Тема: ${topic.title}`
    });
    return res.redirect(`/gostinaya/moderation/discussions/${topic.id}?saved=${req.params.action}`);
  } catch (error) {
    next(error);
  }
});

router.post('/messages/:id/:action', async (req, res, next) => {
  try {
    const message = await ModerationRepository.getMessage(req.params.id);
    if (!message) return res.status(404).send('Сообщение не найдено');
    const hidden = req.params.action === 'hide';
    if (!hidden && req.params.action !== 'restore') {
      return res.status(404).send('Неизвестное действие');
    }
    const reason = normalizeModerationReason(req.body.reason);
    if (hidden && !reason) return res.status(400).send('Укажите причину скрытия');
    await ModerationRepository.setMessageHidden(message.id, hidden, req.session.guest.id, reason);
    await ModerationRepository.recordAction({
      actor: req.session.guest,
      action: hidden ? 'message_hidden' : 'message_restored',
      targetType: 'message',
      targetId: message.id,
      details: reason
        ? `Причина: ${reason} · Тема №${message.topic_id}`
        : `Тема №${message.topic_id}`
    });
    return res.redirect(`/gostinaya/moderation/discussions/${message.topic_id}?saved=${req.params.action}`);
  } catch (error) {
    next(error);
  }
});

router.get('/reports', async (req, res, next) => {
  try {
    const requestedStatus = String(req.query.status || 'open');
    const status = requestedStatus === 'all' || reportStatuses.has(requestedStatus)
      ? requestedStatus
      : 'open';
    const reports = await ModerationRepository.listReports(status);
    res.render('moderation/reports', {
      title: 'Жалобы',
      reports,
      status,
      saved: req.query.saved || ''
    });
  } catch (error) {
    next(error);
  }
});

router.post('/reports/:id/status', async (req, res, next) => {
  try {
    const status = String(req.body.status || '');
    if (!reportStatuses.has(status) || status === 'open') {
      return res.status(400).send('Некорректный статус');
    }
    const report = await ModerationRepository.getReport(req.params.id);
    if (!report) return res.status(404).send('Жалоба не найдена');
    const note = normalizeModerationReason(req.body.note);
    await ModerationRepository.updateReport(report.id, status, req.session.guest.id, note);
    await ModerationRepository.recordAction({
      actor: req.session.guest,
      action: `report_${status}`,
      targetType: 'report',
      targetId: report.id,
      details: note
    });
    return res.redirect(`/gostinaya/moderation/reports?saved=${status}`);
  } catch (error) {
    next(error);
  }
});

router.get('/log', async (req, res, next) => {
  try {
    const actions = await ModerationRepository.listActions(200);
    res.render('moderation/log', {
      title: 'Журнал модерации',
      actions
    });
  } catch (error) {
    next(error);
  }
});

export default router;
