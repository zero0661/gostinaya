#!/usr/bin/env python3
"""Download latest encrypted backup via restricted SSH; resume and verify locally."""
import datetime
import fcntl
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys

ROOT = pathlib.Path.home() / 'AfterLoginBackups/Beget'
FILES = {'COMPLETE', 'SHA256SUMS', 'archive.hmac', 'key.enc', 'project.tar.gz.enc'}

def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024**2), b''):
            value.update(chunk)
    return value.hexdigest()

def metadata(ssh):
    r = subprocess.run(ssh + ['latest'], check=True, capture_output=True, timeout=60)
    assert len(r.stdout) < 16384, 'Oversized metadata'
    data = json.loads(r.stdout)
    assert data['format'] == 'after-login-backup-v1'
    assert re.fullmatch(r'after-login-\d{8}T\d{6}Z', data['name'])
    assert set(data['files']) == FILES
    for value in data['files'].values():
        assert isinstance(value['bytes'], int) and 0 < value['bytes'] <= 20 * 1024**3
        assert re.fullmatch(r'[0-9a-f]{64}', value['sha256'])
    return data

def main():
    os.umask(0o077)
    ROOT.mkdir(mode=0o700, exist_ok=True)
    with (ROOT / '.download.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('DOWNLOAD_ALREADY_RUNNING', flush=True)
            return
        print('START: ' + datetime.datetime.now().isoformat(timespec='seconds'), flush=True)
        ssh = ['/usr/bin/ssh', '-i', str(ROOT.parent / 'download-key'), '-o', 'IdentitiesOnly=yes',
               '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=20',
               '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=3', '-o', 'UserKnownHostsFile=/Users/hanoii-macbook/.ssh/afterlogin-beget-known-hosts', 'root@155.212.138.23']
        data = metadata(ssh)
        name = data['name']
        final = ROOT / name
        marker = ROOT / (name + '.verified.json')
        if final.is_dir() and marker.is_file():
            assert not final.is_symlink()
            assert json.loads(marker.read_text())['files'] == data['files']
            assert all(digest(final / f) == data['files'][f]['sha256'] for f in FILES)
            print('LATEST_OFFSITE_BACKUP_ALREADY_VERIFIED: ' + name, flush=True)
            return
        incoming = ROOT / '.incoming'
        incoming.mkdir(mode=0o700, exist_ok=True)
        bundle = incoming / name
        bundle.mkdir(mode=0o700, exist_ok=True)
        assert not incoming.is_symlink() and not bundle.is_symlink()
        remaining = sum(max(0, v['bytes'] - ((bundle / f).stat().st_size if (bundle / f).is_file() else 0))
                        for f, v in data['files'].items())
        assert shutil.disk_usage(ROOT).free > remaining + data['files']['project.tar.gz.enc']['bytes'] + 512 * 1024**2, 'Insufficient Mac disk space'
        for filename in sorted(FILES):
            path = bundle / filename
            assert not path.is_symlink()
            expected = data['files'][filename]
            offset = path.stat().st_size if path.exists() else 0
            assert offset <= expected['bytes'], 'Partial file too large'
            if offset < expected['bytes']:
                print('DOWNLOADING: ' + filename + ' (resume at ' + str(offset) + ' bytes)', flush=True)
                with path.open('ab') as target:
                    subprocess.run(ssh + ['file ' + name + ' ' + filename + ' ' + str(offset)],
                                   stdout=target, check=True, timeout=7200)
            assert path.stat().st_size == expected['bytes'], 'File size mismatch'
            assert digest(path) == expected['sha256'], 'File checksum mismatch'
        subprocess.run([sys.executable, str(ROOT.parent / 'verify-beget-backup.py'), str(bundle), str(ROOT.parent / 'private.pem')], check=True)
        if final.exists():
            assert not final.is_symlink() and all(digest(final / f) == data['files'][f]['sha256'] for f in FILES)
            shutil.rmtree(bundle)
        else:
            bundle.rename(final)
        marker.write_text(json.dumps(data, indent=2) + '\n')
        # Prune only completed copies carrying a verifier marker; leave all other files untouched.
        verified = sorted([p for p in ROOT.iterdir() if re.fullmatch(r'after-login-\d{8}T\d{6}Z', p.name)
                           and p.is_dir() and not p.is_symlink() and (ROOT / (p.name + '.verified.json')).is_file()],
                          key=lambda p: p.name, reverse=True)
        for old in verified[3:]:
            assert {p.name for p in old.iterdir()} == FILES and not any(p.is_symlink() for p in old.iterdir())
            shutil.rmtree(old)
            (ROOT / (old.name + '.verified.json')).unlink()
        print('OFFSITE_DOWNLOAD_AND_VERIFICATION_OK: ' + name, flush=True)

if __name__ == '__main__':
    main()
