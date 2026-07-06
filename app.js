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
app.use('/public', express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.status(200).send('Gostinaya is alive');
});

app.get('/gostinaya', (req, res) => {
    res.render('gostinaya');
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Gostinaya app is running on http://127.0.0.1:${PORT}`);
});
