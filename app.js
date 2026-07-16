import GuestController from './controllers/GuestController.js';
import express from 'express';
import expressLayouts from 'express-ejs-layouts';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import morgan from 'morgan';
import rooms from './config/rooms.js';
import db from './database/db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set('view engine', 'ejs');
app.use(expressLayouts);
app.set('layout', 'layouts/main');
app.set('views', path.join(__dirname, 'views'));
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
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

app.get('/gostinaya/:room', (req, res) => {
    const room = rooms[req.params.room];

    if (!room) {
        return res.status(404).send('Комната не найдена');
    }

    res.render('rooms/gostinaya', room);
});

app.post('/api/guests/register', (req, res) => {
    GuestController.register(req, res);
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Gostinaya app is running on http://127.0.0.1:${PORT}`);
});
