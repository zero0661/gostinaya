import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import net from 'node:net';
import nodemailer from 'nodemailer';
import path from 'node:path';

function run(args) {
  return execFileSync('docker', args, { encoding: 'utf8' }).trim();
}

function parseEnvLines(text) {
  const result = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function maskUser(value) {
  if (!value) return '(missing)';
  const at = value.indexOf('@');
  if (at > 1) return value.slice(0, 2) + '***' + value.slice(at);
  return '(configured)';
}

function present(value) {
  return value ? 'configured' : 'MISSING';
}

function findGhostContainer() {
  const names = run(['ps', '--format', '{{.Names}}']).split(/\r?\n/).filter(Boolean);
  return names.find((name) => name === 'ghost-ghost-1')
    || names.find((name) => /ghost/i.test(name))
    || null;
}

async function tcpProbe(host, port) {
  if (!host || !port) return { ok: false, detail: 'skipped: SMTP host or port is missing' };
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port: Number(port), timeout: 7000 });
    socket.once('connect', () => {
      socket.destroy();
      resolve({ ok: true, detail: 'TCP connection succeeded' });
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve({ ok: false, detail: 'TCP connection timed out' });
    });
    socket.once('error', (error) => {
      resolve({ ok: false, detail: error.code || error.message });
    });
  });
}

function asBoolean(value) {
  return String(value || '').toLowerCase() === 'true';
}

async function smtpVerify(config) {
  if (!config.host || !config.port || !config.user || !config.pass) {
    return { ok: false, detail: 'skipped: SMTP configuration is incomplete' };
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: Number(config.port),
    secure: asBoolean(config.secure),
    auth: {
      user: config.user,
      pass: config.pass
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000
  });

  try {
    await transporter.verify();
    return { ok: true, detail: 'server accepted the SMTP credentials' };
  } catch (error) {
    const code = error?.code || error?.responseCode || 'SMTP_ERROR';
    const message = String(error?.message || 'verification failed')
      .replaceAll(config.user, '[redacted-user]')
      .replaceAll(config.pass, '[redacted-password]');
    return { ok: false, detail: `${code}: ${message}` };
  } finally {
    transporter.close();
  }
}

async function smtpSendTest(config, recipient) {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: Number(config.port),
    secure: asBoolean(config.secure),
    auth: {
      user: config.user,
      pass: config.pass
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
    disableFileAccess: true,
    disableUrlAccess: true
  });

  try {
    const info = await transporter.sendMail({
      from: config.from,
      to: recipient,
      subject: '[После логина] Проверка SMTP Ghost',
      text: 'Это техническое тестовое письмо. Оно подтверждает, что Ghost SMTP может передавать сообщения через Brevo.'
    });
    return { ok: true, detail: `accepted by SMTP (message id: ${info.messageId || 'not returned'})` };
  } catch (error) {
    const code = error?.code || error?.responseCode || 'SMTP_ERROR';
    const message = String(error?.message || 'test send failed')
      .replaceAll(config.user, '[redacted-user]')
      .replaceAll(config.pass, '[redacted-password]');
    return { ok: false, detail: `${code}: ${message}` };
  } finally {
    transporter.close();
  }
}

async function main() {
  const sendTestArg = process.argv.find((arg) => arg.startsWith('--send-test='));
  const testRecipient = sendTestArg ? sendTestArg.slice('--send-test='.length).trim() : '';
  if (sendTestArg && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testRecipient)) {
    console.error('Invalid --send-test email address.');
    process.exitCode = 1;
    return;
  }

  const container = findGhostContainer();
  if (!container) {
    console.error('Ghost container was not found.');
    process.exitCode = 1;
    return;
  }

  const envList = JSON.parse(run(['inspect', container, '--format', '{{json .Config.Env}}']));
  const ghostEnv = Object.fromEntries(envList.map((entry) => {
    const separator = entry.indexOf('=');
    return separator === -1 ? [entry, ''] : [entry.slice(0, separator), entry.slice(separator + 1)];
  }));

  const composeFiles = run([
    'inspect',
    container,
    '--format',
    '{{index .Config.Labels "com.docker.compose.project.config_files"}}'
  ]) || '(not exposed by Docker label)';

  const ghost = {
    transport: ghostEnv.mail__transport,
    from: ghostEnv.mail__from,
    host: ghostEnv.mail__options__host,
    port: ghostEnv.mail__options__port,
    secure: ghostEnv.mail__options__secure,
    user: ghostEnv.mail__options__auth__user,
    pass: ghostEnv.mail__options__auth__pass
  };

  let lounge = {};
  const envPath = path.resolve('.env');
  try {
    lounge = parseEnvLines(readFileSync(envPath, 'utf8'));
  } catch {
    // The report remains useful even if the Lounge .env is elsewhere.
  }

  console.log('Ghost transactional mail diagnostic (read-only)');
  console.log('Container:', container);
  console.log('Compose file(s):', composeFiles);
  console.log('');
  console.log('Ghost SMTP configuration:');
  console.log('  transport:', ghost.transport || 'MISSING');
  console.log('  from:', ghost.from || 'MISSING');
  console.log('  host:', ghost.host || 'MISSING');
  console.log('  port:', ghost.port || 'MISSING');
  console.log('  secure:', ghost.secure || 'MISSING');
  console.log('  user:', maskUser(ghost.user));
  console.log('  password:', present(ghost.pass));
  console.log('');
  console.log('Existing Lounge SMTP configuration (values redacted where sensitive):');
  console.log('  host:', lounge.SMTP_HOST || 'MISSING');
  console.log('  port:', lounge.SMTP_PORT || 'MISSING');
  console.log('  secure:', lounge.SMTP_SECURE || 'MISSING');
  console.log('  user:', maskUser(lounge.SMTP_USER));
  console.log('  password:', present(lounge.SMTP_PASS));
  console.log('  from:', lounge.MAIL_FROM || 'MISSING');

  const ghostProbe = await tcpProbe(ghost.host, ghost.port);
  const ghostAuth = await smtpVerify(ghost);
  const loungeProbe = await tcpProbe(lounge.SMTP_HOST, lounge.SMTP_PORT);
  console.log('');
  console.log('Ghost SMTP reachability from VPS:', ghostProbe.ok ? 'OK' : 'FAILED', '-', ghostProbe.detail);
  console.log('Ghost SMTP authentication:', ghostAuth.ok ? 'OK' : 'FAILED', '-', ghostAuth.detail);
  console.log('Lounge SMTP reachability from VPS:', loungeProbe.ok ? 'OK' : 'FAILED', '-', loungeProbe.detail);

  if (testRecipient) {
    const testSend = ghostAuth.ok
      ? await smtpSendTest(ghost, testRecipient)
      : { ok: false, detail: 'skipped because SMTP authentication failed' };
    console.log('Ghost SMTP test message:', testSend.ok ? 'SENT' : 'FAILED', '-', testSend.detail);
  }

  const ghostReady = String(ghost.transport || '').toUpperCase() === 'SMTP'
    && ghost.host && ghost.port && ghost.user && ghost.pass && ghost.from;

  console.log('');
  if (ghostReady && ghostAuth.ok) {
    console.log('RESULT: Ghost SMTP configuration and authentication are valid. Investigate Brevo delivery logs and sender verification next.');
  } else if (ghostReady) {
    console.log('RESULT: Ghost SMTP is configured, but authentication failed. Replace or correct the Brevo SMTP credentials.');
  } else if (lounge.SMTP_HOST && lounge.SMTP_PORT && lounge.SMTP_USER && lounge.SMTP_PASS && lounge.MAIL_FROM) {
    console.log('RESULT: Ghost SMTP is incomplete, while the Lounge already has a complete SMTP account that may be reused.');
  } else {
    console.log('RESULT: Ghost SMTP is incomplete and no complete reusable Lounge SMTP account was found.');
  }
  console.log(testRecipient
    ? 'No settings were changed. One explicitly requested SMTP test message was attempted.'
    : 'No settings were changed and no email was sent.');
}

main().catch((error) => {
  console.error('Diagnostic failed:', error.message);
  process.exitCode = 1;
});
