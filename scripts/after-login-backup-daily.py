#!/usr/bin/env python3
"""Run encrypted backup under one lock; prune only after verified success."""
import fcntl
import hashlib
import importlib.util
import json
import os
import pathlib
import re
import shutil

ROOT = pathlib.Path('/root/after-login-backups')
PATTERN = re.compile(r'after-login-\d{8}T\d{6}Z')
FILES = {'COMPLETE', 'SHA256SUMS', 'archive.hmac', 'key.enc', 'project.tar.gz.enc'}

def module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded

def valid(bundle):
    assert bundle.parent == ROOT and PATTERN.fullmatch(bundle.name)
    assert bundle.is_dir() and not bundle.is_symlink()
    assert {p.name for p in bundle.iterdir()} == FILES, 'Unexpected bundle contents'
    assert all(p.is_file() and not p.is_symlink() for p in bundle.iterdir())
    assert (bundle / 'COMPLETE').read_text().strip() == 'after-login-backup-v1'
    expected = {}
    for line in (bundle / 'SHA256SUMS').read_text().splitlines():
        digest, name = line.split('  ', 1)
        assert re.fullmatch(r'[0-9a-f]{64}', digest) and name not in expected
        expected[name] = digest
    assert set(expected) == {'archive.hmac', 'key.enc', 'project.tar.gz.enc'}
    for name, digest in expected.items():
        hashed = hashlib.sha256()
        with (bundle / name).open('rb') as source:
            for chunk in iter(lambda: source.read(1024**2), b''):
                hashed.update(chunk)
        assert hashed.hexdigest() == digest, 'Backup checksum mismatch'

def prune(latest):
    valid(latest)
    # Unknown, incomplete or unexpected directories are preserved for review.
    old = [p for p in ROOT.iterdir() if PATTERN.fullmatch(p.name) and p.name < latest.name
           and p.is_dir() and not p.is_symlink() and (p / 'COMPLETE').is_file()]
    for candidate in old:
        assert not any(p.is_symlink() for p in candidate.rglob('*'))
        assert {p.name for p in candidate.iterdir()} == FILES
    for candidate in old:
        shutil.rmtree(candidate)
        print('OLD_LOCAL_BACKUP_REMOVED: ' + candidate.name, flush=True)

def main():
    os.umask(0o077)
    creator = module('/usr/local/lib/after-login-backup.py', 'backup_creator')
    watcher = module('/usr/local/lib/ghost-security-watch.py', 'backup_mail')
    config = json.loads(watcher.CONFIG.read_text())
    with (ROOT / '.backup.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        before = {p.name for p in ROOT.iterdir()}
        try:
            creator.create()
            name = (ROOT / 'latest.txt').read_text().strip()
            assert PATTERN.fullmatch(name) and name not in before
            latest = ROOT / name
            prune(latest)
        except Exception as error:
            # Only partial bundles created by THIS locked run may be removed.
            for p in ROOT.iterdir():
                if p.name not in before and PATTERN.fullmatch(p.name) and p.is_dir() and not p.is_symlink():
                    if not (p / 'COMPLETE').exists() and not any(q.is_symlink() for q in p.rglob('*')):
                        shutil.rmtree(p)
            watcher.send(config, '[После логина] Ошибка резервного копирования',
                         'Ночная резервная копия не завершена. Прежние завершённые копии сохранены. '
                         'Проверьте: journalctl -u after-login-backup.service -n 30. '
                         'Тип ошибки: ' + type(error).__name__ + '. Секреты в письмо не включены.')
            raise RuntimeError('Backup job failed; review server journal') from None
    watcher.send(config, '[После логина] Резервная копия готова',
                 'Создана и проверена новая зашифрованная копия: ' + name + '. '
                 'На сервере хранится одна актуальная копия. Скачивание на Mac этой командой не выполняется.')
    print('DAILY_BACKUP_AND_RETENTION_OK', flush=True)

if __name__ == '__main__':
    main()
