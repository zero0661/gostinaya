import 'dotenv/config';
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

const newsletterTransporter = nodemailer.createTransport({
  host: process.env.NEWSLETTER_SMTP_HOST || process.env.SMTP_HOST,
  port: Number(process.env.NEWSLETTER_SMTP_PORT || process.env.SMTP_PORT),
  secure: String(process.env.NEWSLETTER_SMTP_SECURE || process.env.SMTP_SECURE) === 'true',
  auth: {
    user: process.env.NEWSLETTER_SMTP_USER || process.env.SMTP_USER,
    pass: process.env.NEWSLETTER_SMTP_PASS || process.env.SMTP_PASS
  }
});

export async function sendMail({ to, subject, html, text }) {
  return transporter.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject,
    text,
    html
  });
}

export async function sendNewsletterMail({ to, subject, html, text, headers, attachments }) {
  return newsletterTransporter.sendMail({
    from: process.env.NEWSLETTER_MAIL_FROM || process.env.MAIL_FROM,
    to,
    subject,
    text,
    html,
    headers,
    attachments
  });
}
