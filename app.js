import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import morgan from 'morgan';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/gostinaya/public', express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.status(200).send('Gostinaya is alive');
});

const rooms = {
    home: {
        title: 'Гостиная',
        lead: 'Пространство для участников проекта «После логина».',
        text: 'Здесь будет открываться выбранная комната.'
    },
    voices: {
        title: 'Голоса проекта',
        lead: 'Истории участников, вокруг которых рождаются разговоры.',
        text: 'Здесь появятся Голоса проекта.'
    },
    discussions: {
        title: 'Обсуждения',
        lead: 'Темы, которые создают сами участники.',
        text: 'Здесь будут разговоры у Камина и другие обсуждения.'
    },
    questions: {
        title: 'Вопросы автору',
        lead: 'Разговоры в формате вопрос → ответ.',
        text: 'Здесь участники смогут задавать вопросы автору.'
    },
    workshop: {
        title: 'Мастерская проекта',
        lead: 'Место, где проект развивается вместе с участниками.',
        text: 'Здесь будут идеи, черновики и планы развития.'
    },
    library: {
        title: 'Полка',
        lead: 'Книги, фильмы, музыка, статьи и лекции, которые хочется обсудить.',
        text: 'Здесь появятся рекомендации участников.'
    },
    archive: {
        title: 'Архив проекта',
        lead: 'Летопись, документы, исследования и важные материалы проекта.',
        text: 'Здесь будут храниться значимые материалы и прецеденты.'
    },
    gratitude: {
        title: 'Благодарности',
        lead: 'Люди, которые помогают проекту развиваться.',
        text: 'Здесь появятся благодарности участникам.'
    }
};

app.get('/gostinaya', (req, res) => {
    res.render('gostinaya', rooms.home);
});

app.get('//gostinaya/:room', (req, res) => {
    const room = rooms[req.params.room];

    if (!room) {
        return res.status(404).send('Комната не найдена');
    }

    res.render('gostinaya', room);
});
app.get('/gostinaya/:room', (req, res) => {
    const room = rooms[req.params.room];

    if (!room) {
        return res.status(404).send('Комната не найдена');
    }

    res.render('gostinaya', room);
});
app.listen(PORT, '127.0.0.1', () => {
  console.log(`Gostinaya app is running on http://127.0.0.1:${PORT}`);
});
