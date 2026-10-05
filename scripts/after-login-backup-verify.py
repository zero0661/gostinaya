#!/usr/bin/env python3
"""Verify an after-login-backup-v1 bundle locally without exposing secrets."""
import gzip
import hashlib
import hmac
import json
import os
import pathlib
import shutil
import sqlite3
import subprocess
import sys
import tarfile
import tempfile

def main():
    os.umask(0o077)
    root = pathlib.Path.home() / 'Documents/AfterLoginBackups'
    bundle = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'after-login-20261005T052010Z'
    private = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else root / 'private.pem'
    assert (bundle / 'COMPLETE').read_text().strip() == 'after-login-backup-v1', 'Incomplete bundle'
    encrypted = bundle / 'project.tar.gz.enc'
    assert shutil.disk_usage(bundle).free > encrypted.stat().st_size + 256 * 1024**2, 'Insufficient temporary disk space'
    print('1/3: Key and archive authentication', flush=True)
    r = subprocess.run(['openssl', 'pkeyutl', '-decrypt', '-inkey', str(private),
                        '-in', str(bundle / 'key.enc'), '-pkeyopt', 'rsa_padding_mode:oaep',
                        '-pkeyopt', 'rsa_oaep_md:sha256'], capture_output=True)
    assert r.returncode == 0 and len(r.stdout) == 64, 'Cannot decrypt archive key'
    material = r.stdout
    mac = hmac.new(material[32:], b'after-login-backup-v1\0' + (bundle / 'key.enc').read_bytes(), hashlib.sha256)
    with encrypted.open('rb') as source:
        for chunk in iter(lambda: source.read(1024**2), b''):
            mac.update(chunk)
    assert hmac.compare_digest(mac.hexdigest(), (bundle / 'archive.hmac').read_text().strip()), 'Archive authentication failed'
    with tempfile.TemporaryDirectory(prefix='.verify-', dir=bundle.parent) as temporary:
        work = pathlib.Path(temporary)
        archive_path = work / 'project.tar.gz'
        print('2/3: Decryption and full gzip integrity', flush=True)
        r = subprocess.run(['openssl', 'enc', '-d', '-aes-256-cbc', '-pbkdf2', '-iter', '200000',
                            '-pass', 'stdin', '-in', str(encrypted), '-out', str(archive_path)],
                           input=material[:32].hex().encode() + b'\n', capture_output=True)
        assert r.returncode == 0, 'Archive decryption failed'
        with gzip.open(archive_path, 'rb') as source:
            for chunk in iter(lambda: source.read(1024**2), b''):
                pass
        print('3/3: Archive structure, SQL dump and SQLite database', flush=True)
        with tarfile.open(archive_path, 'r:gz') as archive:
            members = archive.getmembers()
            names = [m.name for m in members]
            assert len(names) == len(set(names)), 'Duplicate archive entries'
            assert all(not pathlib.PurePosixPath(n).is_absolute() and '..' not in pathlib.PurePosixPath(n).parts for n in names), 'Unsafe archive paths'
            for name in ('data/manifest.json', 'data/ghost.sql.gz', 'data/gostinaya.db',
                         'config/ghost/docker-compose.yml', 'gostinaya/package.json'):
                assert archive.getmember(name).isfile(), 'Missing regular file: ' + name
            assert any(n.startswith('ghost-content/') for n in names), 'Ghost content missing'
            with archive.extractfile('data/manifest.json') as source:
                manifest = json.load(source)
            assert manifest['format'] == 'after-login-backup-v1' and manifest['sql_restore_test'] == 'OK', 'Invalid manifest'
            with archive.extractfile('data/ghost.sql.gz') as source:
                with gzip.GzipFile(fileobj=source) as dump:
                    total = sum(len(chunk) for chunk in iter(lambda: dump.read(1024**2), b''))
            assert total > 100, 'Empty SQL dump'
            db = work / 'gostinaya.db'
            with archive.extractfile('data/gostinaya.db') as source, db.open('wb') as target:
                shutil.copyfileobj(source, target)
        with sqlite3.connect(db.as_uri() + '?mode=ro', uri=True) as connection:
            assert connection.execute('PRAGMA integrity_check').fetchall() == [('ok',)], 'SQLite integrity failure'
            assert not connection.execute('PRAGMA foreign_key_check').fetchall(), 'SQLite foreign key failure'
    print('OFFSITE_BACKUP_DECRYPTION_AND_INTEGRITY_OK', flush=True)
    print('Temporary decrypted files removed; encrypted bundle retained.', flush=True)

if __name__ == '__main__':
    main()
