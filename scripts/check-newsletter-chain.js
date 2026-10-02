#!/usr/bin/env node
import 'dotenv/config';
import sqlite3 from 'sqlite3';
import Ghost from '../services/GhostApiService.js';

const email = process.argv[2];
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Usage: node scripts/check-newsletter-chain.js reader@example.com');
const member = await Ghost.findMemberByEmail(email);
const newsletters = await Ghost.listNewsletters();
console.log(JSON.stringify({
  member: member && { id: member.id, email: member.email, subscribed: member.subscribed, suppression: member.email_suppression, newsletters: member.newsletters },
  newsletters: newsletters.map(({ id, name, status, subscribe_on_signup }) => ({ id, name, status, subscribe_on_signup })),
  sender: process.env.NEWSLETTER_MAIL_FROM || process.env.MAIL_FROM,
  smtpConfigured: Boolean((process.env.NEWSLETTER_SMTP_HOST || process.env.SMTP_HOST) && (process.env.NEWSLETTER_SMTP_USER || process.env.SMTP_USER)),
  webhookSecretConfigured: Boolean(process.env.GHOST_WEBHOOK_SECRET)
}, null, 2));
const db = new sqlite3.Database(process.env.GOSTINAYA_DB_PATH || '/root/gostinaya/database/gostinaya.db', sqlite3.OPEN_READONLY);
try {
  const rows = await new Promise((resolve, reject) => db.all(
    'SELECT delivery_key, newsletter_slug, status, attempts, message_id, error, updated_at FROM newsletter_deliveries WHERE recipient_email = ? ORDER BY updated_at DESC LIMIT 20',
    [email.toLowerCase()], (error, rows) => error ? reject(error) : resolve(rows)
  ));
  console.log(JSON.stringify({ deliveries: rows }, null, 2));
} finally { await new Promise(resolve => db.close(resolve)); }
