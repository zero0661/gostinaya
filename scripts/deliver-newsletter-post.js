#!/usr/bin/env node
import 'dotenv/config';
import Ghost from '../services/GhostApiService.js';
import { newsletterPublication } from '../services/NewsletterPublication.js';
import { NewsletterDeliveryService } from '../services/NewsletterDeliveryServiceCore.js';
import deliveries from '../repositories/NewsletterDeliveryRepository.js';
import Signup from '../services/NewsletterSignupService.js';
import { sendNewsletterMail } from '../utils/mailer.js';

const [postId, email] = process.argv.slice(2).filter(arg => arg !== '--apply');
if (!postId || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error('Usage: node scripts/deliver-newsletter-post.js POST_ID reader@example.com [--apply]');
}
const publication = newsletterPublication(await Ghost.getPostById(postId), process.env.APP_URL);
if (!publication) throw new Error('Post is not published');
const language = publication.urlEn ? 'en' : 'ru';
const channel = language === 'en' ? 'After Login — EN' : 'После логина — RU';
const members = (await Ghost.listNewsletterMembers(channel)).filter(member => member.email.toLowerCase() === email.toLowerCase());
if (members.length !== 1) throw new Error('Recipient must be actively subscribed to the article language');
console.log(JSON.stringify({ mode: process.argv.includes('--apply') ? 'apply' : 'dry-run', publication, recipient: email }, null, 2));
if (process.argv.includes('--apply')) {
  const service = new NewsletterDeliveryService({
    ghost: { listNewsletterMembers: async () => members }, deliveries, mailer: sendNewsletterMail,
    unsubscribeUrl: details => Signup.createUnsubscribeUrl(details)
  });
  const result = await service.deliverPublication(publication);
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
}
// SQLite repositories hold connections; all writes above have been awaited.
process.exit(process.exitCode || 0);
