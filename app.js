import AuthService from './services/AuthService.js';
import GuestController from './controllers/GuestController.js';
import GuestRepository from './repositories/GuestRepository.js';
import DiscussionRepository from './repositories/DiscussionRepository.js';
import ArticleDiscussionRepository from './repositories/ArticleDiscussionRepository.js';
import ArticleMetadataService from './services/ArticleMetadataService.js';
import GhostWebhookService from './services/GhostWebhookService.js';
import NotificationRepository from './repositories/NotificationRepository.js';
import NotificationService from './services/NotificationService.js';
import ModerationRepository from './repositories/ModerationRepository.js';
import EmailVerificationService from './services/EmailVerificationService.js';
import { createArticleDiscussionRedirectHandler } from './controllers/ArticleDiscussionController.js';
import requireGuest from './middleware/requireGuest.js';
import moderationRouter from './routes/moderation.js';
import reportsRouter from './routes/reports.js';
import express from 'express';
import expressLayouts from 'express-ejs-layouts';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import morgan from 'morgan';
import rooms from './config/rooms.js';
import db from './database/db.js';
import session from 'express-session';
import sessionFileStore from 'session-file-store';
import { addReturnTo, normalizeAuthReturnTo } from './utils/authRedirect.js';
import { formatMoscowDateTime } from './utils/dateTime.js';
import {
    loginCredentialRateLimit,
    loginIpRateLimit,
    messagePublicationRateLimit,
    passwordResetCompletionRateLimit,
    passwordResetRequestEmailRateLimit,
    passwordResetRequestIpRateLimit,
    registrationRateLimit,
    reportPublicationRateLimit,
    topicPublicationRateLimit,
    verificationResendRateLimit
} from './middleware/rateLimit.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const articleDiscussionRedirect = createArticleDiscussionRedirectHandler(
    ArticleDiscussionRepository
);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FileStore = sessionFileStore(session);

app.set('view engine', 'ejs');
app.use(expressLayouts);
app.set('layout', 'layouts/main');
app.set('views', path.join(__dirname, 'views'));
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));

app.use(express.json());

app.use((req, res, next) => {
    res.locals.formatMoscowDateTime = formatMoscowDateTime;
    next();
});

app.set('trust proxy', 1);

app.use(session({
    store: new FileStore({
        path: path.join(__dirname, 'database', 'sessions'),
        ttl: 60 * 60 * 24 * 30,
        reapInterval: 60 * 60,
        retries: 1
    }),
    name: 'gostinaya.sid',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 30
    }
}));

app.use(async (req, res, next) => {
    res.locals.currentGuest = null;

    if (!req.session?.guest?.id) {
        return next();
    }

    try {
        const guest = await GuestRepository.findById(req.session.guest.id);

        if (!guest) {
            return req.session.destroy(() => res.redirect('/gostinaya/login'));
        }

        if (Number(guest.is_blocked) === 1) {
            const reason = guest.blocked_reason;
            return req.session.destroy(() => res.status(403).render('auth/blocked', {
                title: 'Доступ приостановлен / Access suspended',
                layout: 'layouts/public',
                reason
            }));
        }

        req.session.guest = {
            ...req.session.guest,
            name: guest.name,
            email: guest.email,
            role: guest.role,
            language: guest.language
        };
        res.locals.currentGuest = req.session.guest;
        return next();
    } catch (error) {
        return next(error);
    }
});

app.use(async (req, res, next) => {
    res.locals.notificationUnreadCount = 0;
    res.locals.moderationOpenReportCount = 0;

    if (!req.session?.guest?.id) {
        return next();
    }

    try {
        res.locals.notificationUnreadCount =
            await NotificationRepository.countUnread(
                req.session.guest.id
            );

        if (['admin', 'moderator'].includes(req.session.guest.role)) {
            res.locals.moderationOpenReportCount =
                await ModerationRepository.countOpenReports();
        }

        next();
    } catch (error) {
        next(error);
    }
});

app.use('/gostinaya/public', express.static(path.join(__dirname, 'public')));

async function handleGhostPostWebhook(req, res) {
  const secret =
    req.get('x-ghost-webhook-secret') ||
    req.query.secret;

  if (!process.env.GHOST_WEBHOOK_SECRET || secret !== process.env.GHOST_WEBHOOK_SECRET) {
    return res.status(401).json({
      ok: false,
      error: 'Unauthorized'
    });
  }

  try {
    const result = await GhostWebhookService.handlePost(req.body);

    if (result.created && result.publication) {
      try {
        await NotificationService.notifyPublication({
          topicId: result.topicId,
          actorId: 2,
          ...result.publication
        });
      } catch (notificationError) {
        console.error('Publication notification error:', notificationError);
      }
    }

    return res.status(200).json({
      ok: true,
      ...result
    });
  } catch (error) {
    console.error('Ghost post webhook error:', error);

    return res.status(500).json({
      ok: false,
      error: 'Webhook processing failed'
    });
  }
}

app.post('/gostinaya/webhooks/ghost/post-published', handleGhostPostWebhook);
app.post('/gostinaya/webhooks/ghost/post-updated', handleGhostPostWebhook);

app.get('/health', (req, res) => {
  res.status(200).send('Gostinaya is alive');
});

app.get('/gostinaya/register', (req, res) => {
    const returnTo = normalizeAuthReturnTo(req.query.returnTo);

    res.render('auth/register', {
        title: 'Регистрация / Registration',
        layout: 'layouts/public',
        returnTo
    });
});

app.get('/gostinaya/check-email', (req, res) => {
    res.render('auth/check-email', {
        title: 'Проверьте почту / Check your inbox',
        layout: 'layouts/public',
        email: String(req.query.email || '').trim().slice(0, 254)
    });
});

app.get('/gostinaya/verify-email', async (req, res, next) => {
    try {
        const guest = await EmailVerificationService.verify(req.query.token);

        if (!guest) {
            return res.status(400).render('auth/verify-email', {
                title: 'Ссылка недействительна / Invalid link',
                layout: 'layouts/public',
                verified: false
            });
        }

        req.session.guest = {
            id: guest.id,
            name: guest.name,
            email: guest.email,
            role: guest.role,
            language: guest.language
        };

        await new Promise((resolve, reject) => {
            req.session.save((error) => error ? reject(error) : resolve());
        });

        const returnTo = normalizeAuthReturnTo(req.query.returnTo);
        return res.redirect(addReturnTo('/gostinaya/welcome', returnTo));
    } catch (error) {
        next(error);
    }
});

app.get('/gostinaya', (req, res) => {
    if (!req.session.guest?.id) {
        return res.render('public-lounge', {
        title: 'Гостиная / The Lounge',
        layout: 'layouts/public'
    });
    }

    return res.redirect('/gostinaya/hall');
});

app.get('/gostinaya/welcome', requireGuest, (req, res) => {
    const returnTo = normalizeAuthReturnTo(req.query.returnTo);

    res.render('auth/welcome', {
        title: 'Дверь открыта / The Door Is Open',
        layout: 'layouts/public',
        guest: req.session.guest,
        returnTo
    });
});

app.get('/gostinaya/hall', requireGuest, async (req, res, next) => {
  try {
    const [recentActivity, roomStats] = await Promise.all([
        DiscussionRepository.getRecentActivity(15),
        DiscussionRepository.getRoomStats()
    ]);

    res.render('hall/index', {
      title: 'Холл / Hall',
      recentActivity,
      roomStats,
      guest: req.session.guest
    });
  } catch (error) {
    next(error);
  }
});

app.get('/gostinaya/members', async (req, res, next) => {
    if (!req.session.guest?.id) {
        return res.redirect('/gostinaya/login');
    }

    try {
        const members = await GuestRepository.listMembers();

        res.render('members/index', {
            title: 'Участники / Members',
            members
        });
    } catch (error) {
        next(error);
    }
});

app.get('/gostinaya/member/:id', async (req, res, next) => {
    if (!req.session.guest?.id) {
        return res.redirect('/gostinaya/login');
    }

    try {
        const member = await GuestRepository.findPublicById(req.params.id);

        if (!member) {
            return res.status(404).send('Участник не найден');
        }

        const activity = await GuestRepository.getPublicActivity(req.params.id);

        res.render('members/profile', {
            title: `${member.name} / Member`,
            member,
            topics: activity.topics,
            messages: activity.messages
        });
    } catch (error) {
        next(error);
    }
});

app.get('/gostinaya/profile', async (req, res, next) => {
    if (!req.session.guest?.id) {
        return res.redirect('/gostinaya/login');
    }

    try {
        const guest = await GuestRepository.findById(req.session.guest.id);

        if (!guest) {
            return req.session.destroy(() => {
                res.redirect('/gostinaya/login');
            });
        }

        res.render('profile/index', {
            title: 'Мой профиль / My Profile',
            guest,
            saved: req.query.saved === '1'
        });
    } catch (error) {
        next(error);
    }
});

app.post('/gostinaya/profile', async (req, res, next) => {
    if (!req.session.guest?.id) {
        return res.redirect('/gostinaya/login');
    }

    const name = String(req.body.name || '').trim().slice(0, 80);
    const location = String(req.body.location || '').trim().slice(0, 120);
    const bio = String(req.body.bio || '').trim().slice(0, 1000);
    const language = req.body.language === 'en' ? 'en' : 'ru';

    if (!name) {
        return res.status(400).send('Имя обязательно');
    }

    try {
        await GuestRepository.updateProfile(req.session.guest.id, {
            name,
            location,
            bio,
            language,
            notifyReplies: req.body.notify_replies ? 1 : 0,
            notifyFollowedDiscussions:
                req.body.notify_followed_discussions ? 1 : 0,
            notifyPublications: req.body.notify_publications ? 1 : 0,
            notifyNewTopics: req.body.notify_new_topics ? 1 : 0,
            notifyAllArticleDiscussions:
                req.body.notify_all_article_discussions ? 1 : 0,
            notifyEmail: req.body.notify_email ? 1 : 0,
            profileCompleted: 1
        });

        req.session.guest.name = name;
        req.session.guest.language = language;

        res.redirect('/gostinaya/profile?saved=1');
    } catch (error) {
        next(error);
    }
});

app.get('/gostinaya/notifications', async (req, res, next) => {
    if (!req.session?.guest?.id) {
        return res.redirect('/gostinaya/login');
    }

    try {
        const notifications =
            await NotificationRepository.listForRecipient(
                req.session.guest.id,
                50
            );

        res.render('notifications/index', {
            title: 'Уведомления',
            notifications
        });
    } catch (error) {
        next(error);
    }
});

app.post(
    '/gostinaya/notifications/read-all',
    async (req, res, next) => {
        if (!req.session?.guest?.id) {
            return res.redirect('/gostinaya/login');
        }

        try {
            await NotificationRepository.markAllRead(
                req.session.guest.id
            );

            res.redirect('/gostinaya/notifications');
        } catch (error) {
            next(error);
        }
    }
);

app.get('/gostinaya/notifications/:id/open', async (req, res, next) => {
    if (!req.session?.guest?.id) {
        return res.redirect('/gostinaya/login');
    }

    try {
        const notification = await NotificationRepository.getForRecipient(
            req.params.id,
            req.session.guest.id
        );

        if (!notification) {
            return res.status(404).send('Уведомление не найдено / Notification not found');
        }

        await NotificationRepository.markRead(
            notification.id,
            req.session.guest.id
        );

        if (!notification.topic_id) {
            return res.redirect('/gostinaya/notifications');
        }

        return res.redirect(
            `/gostinaya/topic/${notification.topic_id}` +
            (notification.message_id ? `#message-${notification.message_id}` : '')
        );
    } catch (error) {
        next(error);
    }
});

app.use('/gostinaya/moderation', moderationRouter);
app.use('/gostinaya/reports', reportPublicationRateLimit, reportsRouter);


app.post('/gostinaya/logout', (req, res, next) => {
    req.session.destroy((error) => {
        if (error) {
            return next(error);
        }

        res.clearCookie('gostinaya.sid');
        res.redirect('/gostinaya/login');
    });
});


app.get('/gostinaya/reset-password', (req, res) => {
  res.render('auth/reset-password', {
    layout: 'layouts/public',
    title: 'Новый пароль / New password',
    token: req.query.token || ''
  });
});

app.get('/gostinaya/login', (req, res) => {
    const returnTo = normalizeAuthReturnTo(req.query.returnTo);

    res.render('auth/login', {
        title: 'Вход / Login',
        layout: 'layouts/public',
        returnTo
    });
});

app.get(
    '/gostinaya/article/:ghostPostId',
    articleDiscussionRedirect
);

app.post('/gostinaya/topic/:id/messages', messagePublicationRateLimit, async (req, res, next) => {
    if (!req.session.guest?.id) {
        return res.redirect('/gostinaya/login');
    }

    const body = String(req.body.body || '').trim().slice(0, 5000);
    const parentMessageId = req.body.parent_message_id
        ? Number(req.body.parent_message_id)
        : null;

    if (!body) {
        return res.status(400).send('Сообщение не может быть пустым');
    }

    try {
        const topic = await DiscussionRepository.getTopic(req.params.id);

        if (!topic) {
            return res.status(404).send('Тема не найдена');
        }

        if (topic.closed) {
            return res.status(403).send('Тема закрыта');
        }

        let parentMessage = null;

        if (parentMessageId) {
            parentMessage =
                await DiscussionRepository.getMessage(parentMessageId);

            if (
                !parentMessage ||
                Number(parentMessage.topic_id) !== Number(topic.id)
            ) {
                return res.status(400).send(
                    'Некорректное сообщение для ответа'
                );
            }
        }

        const createdMessage =
            await DiscussionRepository.createMessage(
                topic.id,
                req.session.guest.id,
                body,
                parentMessageId
            );

        try {
            await NotificationService.notifyMessage({
                topic,
                messageId: createdMessage.lastID,
                body,
                actor: req.session.guest,
                parentAuthorId: parentMessage?.author_id || null
            });
        } catch (notificationError) {
            console.error('Message notification error:', notificationError);
        }

        res.redirect(
            `/gostinaya/topic/${topic.id}` +
            `#message-${createdMessage.lastID}`
        );
    } catch (error) {
        next(error);
    }
});

app.get('/gostinaya/topic/:id', async (req, res, next) => {
    if (!req.session.guest?.id) {
        return res.redirect('/gostinaya/login');
    }

    try {
        const topic = await DiscussionRepository.getTopic(req.params.id);

        if (!topic) {
            return res.status(404).send('Тема не найдена');
        }

        const [messages, articleDiscussionRaw] = await Promise.all([
            DiscussionRepository.listMessages(topic.id),
            topic.room === 'articles'
                ? ArticleDiscussionRepository.getByTopicId(topic.id)
                : Promise.resolve(null)
        ]);

        let articleDiscussion = articleDiscussionRaw;

        if (articleDiscussionRaw) {
            try {
                const articlePair = await ArticleMetadataService.getPair(
                    articleDiscussionRaw.url_ru,
                    articleDiscussionRaw.url_en
                );

                articleDiscussion = {
                    ...articleDiscussionRaw,
                    article_ru: articlePair.ru,
                    article_en: articlePair.en
                };
            } catch (error) {
                console.error(
                    'Could not load article metadata for discussion:',
                    topic.id,
                    error.message
                );
            }
        }

        if (messages.length) {
            await DiscussionRepository.markTopicRead(
                req.session.guest.id,
                topic.id,
                messages[messages.length - 1].id
            );
        }

        res.render('rooms/topic', {
            title: topic.title,
            topic,
            messages,
            articleDiscussion,
            currentUserId: req.session.guest.id,
            reported: req.query.reported === '1'
        });
    } catch (error) {
        next(error);
    }
});

app.get('/gostinaya/topic/:id/edit', async (req, res, next) => {
  if (!req.session.guest?.id) {
    return res.redirect('/gostinaya/login');
  }

  try {
    const topic = await DiscussionRepository.getTopic(req.params.id);

    if (!topic) {
      return res.status(404).send('Тема не найдена');
    }

    if (Number(topic.author_id) !== Number(req.session.guest.id)) {
      return res.status(403).send('Нельзя редактировать чужую тему');
    }

    res.render('topics/edit', {
      title: 'Редактировать тему',
      topic
    });
  } catch (error) {
    next(error);
  }
});

app.post('/gostinaya/topic/:id/edit', async (req, res, next) => {
  if (!req.session.guest?.id) {
    return res.redirect('/gostinaya/login');
  }

  try {
    const topic = await DiscussionRepository.getTopic(req.params.id);

    if (!topic) {
      return res.status(404).send('Тема не найдена');
    }

    if (Number(topic.author_id) !== Number(req.session.guest.id)) {
      return res.status(403).send('Нельзя редактировать чужую тему');
    }

    const title = String(req.body.title || '').trim();

    if (!title) {
      return res.status(400).send('Название темы не может быть пустым');
    }

    await DiscussionRepository.updateTopic(
      topic.id,
      req.session.guest.id,
      title
    );

    return res.redirect(`/gostinaya/topic/${topic.id}`);
  } catch (error) {
    next(error);
  }
});

app.get('/gostinaya/message/:id/edit', async (req, res, next) => {
  if (!req.session.guest?.id) {
    return res.redirect('/gostinaya/login');
  }

  try {
    const message = await DiscussionRepository.getMessage(req.params.id);

    if (!message) {
      return res.status(404).send('Сообщение не найдено');
    }

    if (Number(message.author_id) !== Number(req.session.guest.id)) {
      return res.status(403).send('Нельзя редактировать чужое сообщение');
    }

    res.render('messages/edit', {
      title: 'Редактировать сообщение',
      message
    });
  } catch (error) {
    next(error);
  }
});

app.post('/gostinaya/message/:id/edit', async (req, res, next) => {
  if (!req.session.guest?.id) {
    return res.redirect('/gostinaya/login');
  }

  try {
    const message = await DiscussionRepository.getMessage(req.params.id);

    if (!message) {
      return res.status(404).send('Сообщение не найдено');
    }

    if (Number(message.author_id) !== Number(req.session.guest.id)) {
      return res.status(403).send('Нельзя редактировать чужое сообщение');
    }

    const body = String(req.body.body || '').trim();

    if (!body) {
      return res.status(400).send('Сообщение не может быть пустым');
    }

    await DiscussionRepository.updateMessage(
      message.id,
      req.session.guest.id,
      body
    );

    return res.redirect(`/gostinaya/topic/${message.topic_id}`);
  } catch (error) {
    next(error);
  }
});

app.get('/gostinaya/:room/new', (req, res) => {
    if (!req.session.guest?.id) {
        return res.redirect('/gostinaya/login');
    }

    const roomKey = req.params.room;
    const room = rooms[roomKey];

    if (!room) {
        return res.status(404).send('Комната не найдена');
    }

    if (roomKey === 'articles') {
        return res.redirect('/gostinaya/articles');
    }

    res.render('rooms/new-topic', {
        title: 'Новая тема',
        roomKey,
        room
    });
});

app.post('/gostinaya/:room/new', topicPublicationRateLimit, async (req, res, next) => {
    if (!req.session.guest?.id) {
        return res.redirect('/gostinaya/login');
    }

    const roomKey = req.params.room;
    const room = rooms[roomKey];
    const title = String(req.body.title || '').trim().slice(0, 160);
    const body = String(req.body.body || '').trim().slice(0, 5000);

    if (!room) {
        return res.status(404).send('Комната не найдена');
    }

    if (roomKey === 'articles') {
        return res.status(403).send('Темы обсуждения статей создаются автоматически');
    }

    if (!title) {
        return res.status(400).send('Заголовок темы обязателен');
    }

    if (!body) {
        return res.status(400).send('Первое сообщение обязательно');
    }

    try {
        const result = await DiscussionRepository.createTopic(
            roomKey,
            title,
            req.session.guest.id
        );

        await DiscussionRepository.createMessage(
            result.lastID,
            req.session.guest.id,
            body
        );

        try {
            await NotificationService.notifyNewTopic({
                topicId: result.lastID,
                actor: req.session.guest,
                title
            });
        } catch (notificationError) {
            console.error('New topic notification error:', notificationError);
        }

        res.redirect(`/gostinaya/topic/${result.lastID}`);
    } catch (error) {
        next(error);
    }
});

app.get('/gostinaya/:room', requireGuest, async (req, res, next) => {
    const roomKey = req.params.room;
    const room = rooms[roomKey];

    if (!room) {
        return res.status(404).send('Комната не найдена');
    }

    try {
        const [topics, articleDiscussions, recentActivity] = await Promise.all([
            roomKey === 'articles'
                ? Promise.resolve([])
                : DiscussionRepository.listTopics(
                    roomKey,
                    req.session.guest?.id || 0
                ),
            roomKey === 'articles'
                ? ArticleDiscussionRepository.list()
                : Promise.resolve([]),
            DiscussionRepository.getRecentActivity(10)
        ]);

        let enrichedArticleDiscussions = articleDiscussions;

        if (roomKey === 'articles') {
            enrichedArticleDiscussions = [];

            const batchSize = 3;

            for (let i = 0; i < articleDiscussions.length; i += batchSize) {
                const batch = articleDiscussions.slice(i, i + batchSize);

                const enrichedBatch = await Promise.all(
                    batch.map(async (discussion) => {
                        try {
                            const articlePair =
                                await ArticleMetadataService.getPair(
                                    discussion.url_ru,
                                    discussion.url_en
                                );

                            return {
                                ...discussion,
                                article_ru: articlePair.ru,
                                article_en: articlePair.en
                            };
                        } catch (error) {
                            console.error(
                                'Could not load article metadata:',
                                discussion.id,
                                error.message
                            );

                            return {
                                ...discussion,
                                article_ru: null,
                                article_en: null
                            };
                        }
                    })
                );

                // Do not render a discussion button without an article. Such
                // rows can remain from old test webhooks or deleted Ghost posts.
                enrichedArticleDiscussions.push(...enrichedBatch.filter(
                    discussion => discussion.article_ru || discussion.article_en
                ));
            }
        }

        res.render('rooms/gostinaya', {
            ...room,
            roomKey,
            topics,
            articleDiscussions: enrichedArticleDiscussions,
            recentActivity
        });
    } catch (error) {
        next(error);
    }
});

app.post('/gostinaya/api/guests/register', registrationRateLimit, (req, res) => {
    GuestController.register(req, res);
});

app.get('/gostinaya/api/session-status', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ authenticated: Boolean(req.session?.guest?.id) });
});

app.post('/gostinaya/api/guests/resend-verification', verificationResendRateLimit, (req, res) => {
    GuestController.resendVerification(req, res);
});

app.post('/gostinaya/api/guests/login', loginIpRateLimit, loginCredentialRateLimit, (req, res) => {
    GuestController.login(req, res);
});

app.post(
    '/gostinaya/api/guests/request-password-reset',
    passwordResetRequestIpRateLimit,
    passwordResetRequestEmailRateLimit,
    (req, res) => {
        GuestController.requestPasswordReset(req, res);
    }
);

app.post('/gostinaya/api/guests/reset-password', passwordResetCompletionRateLimit, async (req, res) => {
    try {
        const token = String(req.body.token || '').trim();
        const password = String(req.body.password || '');

        if (!token || password.length < 8) {
            return res.status(400).json({
                message: 'Пароль должен содержать не менее 8 символов / Password must be at least 8 characters'
            });
        }

        const guest = await GuestRepository.findByResetToken(token);

        if (!guest) {
            return res.status(400).json({
                message: 'Ссылка недействительна или истекла / Link is invalid or expired'
            });
        }

        const passwordHash = await AuthService.hashPassword(password);
        await GuestRepository.updatePassword(guest.id, passwordHash);

        return res.json({
            success: true,
            message: 'Пароль изменён / Password changed'
        });
    } catch (error) {
        console.error(error);

        return res.status(500).json({
            message: 'Не удалось изменить пароль / Could not change password'
        });
    }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Gostinaya app is running on http://127.0.0.1:${PORT}`);
});
