import GuestController from './controllers/GuestController.js';
import GuestRepository from './repositories/GuestRepository.js';
import DiscussionRepository from './repositories/DiscussionRepository.js';
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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

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

app.use('/gostinaya/public', express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.status(200).send('Gostinaya is alive');
});

app.get('/gostinaya/register', (req, res) => {
    res.render('auth/register', {
        title: 'Стать гостем / Become a Guest'
    });
});

app.get('/gostinaya', (req, res) => {
    res.render('rooms/gostinaya', rooms.home);
});

app.get('/gostinaya/hall', (req, res) => {
    res.render('hall/index', {
        title: 'Холл / Hall'
    });
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
            title: 'Мой кабинет / My Cabinet',
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
            notifyNewTopics: req.body.notify_new_topics ? 1 : 0
        });

        req.session.guest.name = name;
        req.session.guest.language = language;

        res.redirect('/gostinaya/profile?saved=1');
    } catch (error) {
        next(error);
    }
});


app.get('/gostinaya/subscriptions', async (req, res, next) => {
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

        res.render('profile/subscriptions', {
            title: 'Мои подписки / My Subscriptions',
            guest
        });
    } catch (error) {
        next(error);
    }
});

app.get('/gostinaya/settings', async (req, res, next) => {
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

        res.render('profile/settings', {
            title: 'Настройки / Settings',
            guest,
            saved: req.query.saved === '1'
        });
    } catch (error) {
        next(error);
    }
});

app.post('/gostinaya/settings', async (req, res, next) => {
    if (!req.session.guest?.id) {
        return res.redirect('/gostinaya/login');
    }

    const language = req.body.language === 'en' ? 'en' : 'ru';

    try {
        await GuestRepository.updateSettings(req.session.guest.id, {
            language,
            notifyReplies: req.body.notify_replies ? 1 : 0,
            notifyFollowedDiscussions:
                req.body.notify_followed_discussions ? 1 : 0,
            notifyPublications:
                req.body.notify_publications ? 1 : 0,
            notifyNewTopics:
                req.body.notify_new_topics ? 1 : 0
        });

        req.session.guest.language = language;

        req.session.save((error) => {
            if (error) {
                return next(error);
            }

            res.redirect('/gostinaya/settings?saved=1');
        });
    } catch (error) {
        next(error);
    }
});

app.post('/gostinaya/logout', (req, res, next) => {
    req.session.destroy((error) => {
        if (error) {
            return next(error);
        }

        res.clearCookie('gostinaya.sid');
        res.redirect('/gostinaya/login');
    });
});

app.get('/gostinaya/login', (req, res) => {
    res.render('auth/login', {
        title: 'Вход / Login'
    });
});




app.post('/gostinaya/topic/:id/messages', async (req, res, next) => {
    if (!req.session.guest?.id) {
        return res.redirect('/gostinaya/login');
    }

    const body = String(req.body.body || '').trim().slice(0, 5000);

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

        await DiscussionRepository.createMessage(
            topic.id,
            req.session.guest.id,
            body
        );

        res.redirect(`/gostinaya/topic/${topic.id}`);
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

        const messages = await DiscussionRepository.listMessages(topic.id);

        res.render('rooms/topic', {
            title: topic.title,
            topic,
            messages
        });
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

    res.render('rooms/new-topic', {
        title: 'Новая тема',
        roomKey,
        room
    });
});

app.post('/gostinaya/:room/new', async (req, res, next) => {
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

        res.redirect(`/gostinaya/topic/${result.lastID}`);
    } catch (error) {
        next(error);
    }
});

app.get('/gostinaya/:room', async (req, res, next) => {
    const roomKey = req.params.room;
    const room = rooms[roomKey];

    if (!room) {
        return res.status(404).send('Комната не найдена');
    }

    try {
        const topics = await DiscussionRepository.listTopics(roomKey);

        res.render('rooms/gostinaya', {
            ...room,
            roomKey,
            topics
        });
    } catch (error) {
        next(error);
    }
});

app.post('/gostinaya/api/guests/register', (req, res) => {
    GuestController.register(req, res);
});

app.post('/gostinaya/api/guests/login', (req, res) => {
    GuestController.login(req, res);
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Gostinaya app is running on http://127.0.0.1:${PORT}`);
});
