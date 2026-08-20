#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  updateDefaultTemplate,
  updateHeaderTemplate
} from '../services/GhostThemeModeService.js';

const APPLY = process.argv.includes('--apply');
const GHOST_CONTAINER = 'ghost-ghost-1';
const THEME_ROOT = '/var/lib/docker/volumes/ghost_ghost_content/_data/themes/liebling';
const BACKUP_ROOT = '/root/ghost-theme-backups';
const FILES = [
  { relative: 'default.hbs', transform: updateDefaultTemplate },
  { relative: 'partials/header.hbs', transform: updateHeaderTemplate }
];

function fail(message) { throw new Error(message); }

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    fail(`${command} failed: ${(result.stderr || result.stdout || '').trim()}`);
  }
  return result.stdout;
}

function main() {
  const plans = FILES.map(item => {
    const file = path.join(THEME_ROOT, item.relative);
    const original = fs.readFileSync(file, 'utf8');
    const updated = item.transform(original);
    return { ...item, file, original, updated, changed: original !== updated };
  });

  for (const item of plans) {
    console.log(`${item.changed ? 'READY' : 'ALREADY'}: ${item.relative}`);
  }
  if (!APPLY) return console.log('Dry run passed. Nothing changed. Run again with --apply.');

  const changes = plans.filter(item => item.changed);
  if (!changes.length) return console.log('Nothing to update.');

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  const backupDir = path.join(BACKUP_ROOT, `theme-mode-${stamp}`);
  fs.mkdirSync(backupDir, { recursive: true });

  for (const item of changes) {
    const backup = path.join(backupDir, item.relative);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.writeFileSync(backup, item.original);
  }

  try {
    for (const item of changes) fs.writeFileSync(item.file, item.updated);
    run('docker', ['restart', GHOST_CONTAINER]);
    const running = run('docker', ['inspect', '-f', '{{.State.Running}}', GHOST_CONTAINER]).trim();
    if (running !== 'true') fail('Ghost container is not running after restart');
  } catch (error) {
    for (const item of changes) fs.writeFileSync(item.file, item.original);
    run('docker', ['restart', GHOST_CONTAINER]);
    throw error;
  }

  console.log(`Backup: ${backupDir}`);
  console.log('Theme default: dark');
  console.log('Mobile theme control: visible in menu');
  console.log('Ghost: restarted and running');
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
