#!/usr/bin/env node
import 'dotenv/config';
import Guests from '../repositories/GuestRepository.js';
import Discussions from '../repositories/DiscussionRepository.js';
import { NotificationService } from '../services/NotificationServiceCore.js';
import { sendMail } from '../utils/mailer.js';

try {
  const args = process.argv.slice(2);
  const [email, language] = args.filter(arg => arg !== '--send');
  if (!email || args.filter(arg => arg !== '--send').length > 2 ||
      args.some(arg => arg.startsWith('--') && arg !== '--send') ||
      (language && !['ru', 'en'].includes(language))) {
    throw new Error('Usage: node scripts/preview-topic-notifications.js ACCOUNT_EMAIL [ru|en] [--send]');
  }
  const account = await Guests.findByEmail(email);
  if (!account || Number(account.is_blocked) === 1) throw new Error('Active Lounge account not found');
  const recipient = { ...account, language: language || account.language };
  const service = new NotificationService({});
  const previews = [];
  for (const room of ['news', 'discussions']) {
    const topics = await Discussions.listTopics(room, account.id);
    const topic = topics.sort((a, b) => Number(b.id) - Number(a.id))[0];
    if (!topic) throw new Error(`No visible topic in ${room}`);
    const messages = await Discussions.listMessages(topic.id);
    const first = messages.sort((a, b) => Number(a.id) - Number(b.id))[0];
    if (!first || first.hidden_at) throw new Error(`Opening message unavailable for topic ${topic.id}`);
    const en = recipient.language === 'en';
    const mail = service.newTopicEmail({
      recipient, actorName: topic.author, room,
      title: (en ? topic.title_en : topic.title_ru) || topic.title,
      body: (en ? topic.body_en : topic.body_ru) || first.body,
      url: service.topicUrl(topic.id)
    });
    previews.push({ room, topicId: topic.id, mail });
  }
  for (const { room, topicId, mail } of previews) {
    console.log(JSON.stringify({ mode: args.includes('--send') ? 'send' : 'preview', room, topicId, subject: mail.subject, text: mail.text }, null, 2));
    if (args.includes('--send')) {
      await sendMail({ ...mail, to: account.email, subject: `Проверка макета — ${mail.subject}` });
      console.log(`Sample sent: ${room}`);
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
// Samples never create topics, internal notifications or change preferences.
process.exit(process.exitCode || 0);
