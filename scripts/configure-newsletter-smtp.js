#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const envPath = path.resolve('.env');

function run(args) {
  return execFileSync('docker', args, { encoding: 'utf8' }).trim();
}

function findGhostContainer() {
  const names = run(['ps', '--format', '{{.Names}}']).split(/\r?\n/).filter(Boolean);
  return names.find(name => name === 'ghost-ghost-1') || names.find(name => /ghost/i.test(name));
}

function updateEnv(source, values) {
  const pending = new Map(Object.entries(values));
  const lines = source.split(/\r?\n/).map(line => {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=/);
    if (!match || !pending.has(match[1])) return line;
    const value = pending.get(match[1]);
    pending.delete(match[1]);
    return `${match[1]}=${value}`;
  });
  if (lines.at(-1) !== '') lines.push('');
  if (pending.size) lines.push('# Newsletter delivery via Ghost/Brevo SMTP');
  for (const [key, value] of pending) lines.push(`${key}=${value}`);
  lines.push('');
  return lines.join('\n');
}

function main() {
  const container = findGhostContainer();
  if (!container) throw new Error('Ghost container was not found');
  const envList = JSON.parse(run(['inspect', container, '--format', '{{json .Config.Env}}']));
  const ghostEnv = Object.fromEntries(envList.map(entry => {
    const separator = entry.indexOf('=');
    return [entry.slice(0, separator), entry.slice(separator + 1)];
  }));
  const values = {
    NEWSLETTER_SMTP_HOST: ghostEnv.mail__options__host,
    NEWSLETTER_SMTP_PORT: ghostEnv.mail__options__port,
    NEWSLETTER_SMTP_SECURE: ghostEnv.mail__options__secure,
    NEWSLETTER_SMTP_USER: ghostEnv.mail__options__auth__user,
    NEWSLETTER_SMTP_PASS: ghostEnv.mail__options__auth__pass,
    NEWSLETTER_MAIL_FROM: 'После логина / After Login <pm@milenin.pro>'
  };
  const missing = Object.entries(values).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new Error(`Ghost SMTP configuration is incomplete: ${missing.join(', ')}`);
  if (!fs.existsSync(envPath)) throw new Error(`Lounge environment file not found: ${envPath}`);

  console.log('Newsletter SMTP source:', container);
  console.log('Host:', values.NEWSLETTER_SMTP_HOST);
  console.log('Port:', values.NEWSLETTER_SMTP_PORT);
  console.log('Secure:', values.NEWSLETTER_SMTP_SECURE);
  console.log('User/password: configured (redacted)');
  console.log('From:', values.NEWSLETTER_MAIL_FROM);
  if (!APPLY) {
    console.log('Dry run passed. Nothing changed. Run again with --apply.');
    return;
  }

  const source = fs.readFileSync(envPath, 'utf8');
  const stat = fs.statSync(envPath);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  const backupPath = `${envPath}.backup-newsletter-${stamp}`;
  fs.copyFileSync(envPath, backupPath, fs.constants.COPYFILE_EXCL);
  fs.writeFileSync(envPath, updateEnv(source, values), { mode: stat.mode });
  fs.chmodSync(envPath, stat.mode);
  console.log('Backup:', backupPath);
  console.log('Newsletter SMTP settings updated. Restart PM2 with --update-env after the database migration.');
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
