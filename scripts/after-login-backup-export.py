#!/usr/bin/env python3
"""Restricted SSH forced command: export only completed encrypted backup files."""
import fcntl
import hashlib
import json
import os
import pathlib
import re
import shlex
import sys

ROOT = pathlib.Path('/root/after-login-backups')
FILES = ('COMPLETE', 'SHA256SUMS', 'archive.hmac', 'key.enc', 'project.tar.gz.enc')

def serve(command, output):
    parts = shlex.split(command)
    assert parts == ['latest'] or (len(parts) == 4 and parts[0] == 'file'), 'Command denied'
    with (ROOT / '.backup.lock').open('r') as lock:
        fcntl.flock(lock, fcntl.LOCK_SH | fcntl.LOCK_NB)
        name = (ROOT / 'latest.txt').read_text().strip()
        assert re.fullmatch(r'after-login-\d{8}T\d{6}Z', name), 'Invalid backup name'
        bundle = ROOT / name
        assert bundle.is_dir() and not bundle.is_symlink()
        assert {p.name for p in bundle.iterdir()} == set(FILES), 'Invalid backup files'
        for filename in FILES:
            path = bundle / filename
            assert path.is_file() and not path.is_symlink(), 'Invalid backup file'
        assert (bundle / 'COMPLETE').read_text().strip() == 'after-login-backup-v1'
        if parts == ['latest']:
            hashes = {}
            for line in (bundle / 'SHA256SUMS').read_text().splitlines():
                digest, filename = line.split('  ', 1)
                assert re.fullmatch(r'[0-9a-f]{64}', digest) and filename not in hashes
                hashes[filename] = digest
            assert set(hashes) == {'archive.hmac', 'key.enc', 'project.tar.gz.enc'}
            for filename in ('COMPLETE', 'SHA256SUMS'):
                hashes[filename] = hashlib.sha256((bundle / filename).read_bytes()).hexdigest()
            metadata = {'format': 'after-login-backup-v1', 'name': name,
                        'files': {f: {'bytes': (bundle / f).stat().st_size, 'sha256': hashes[f]} for f in FILES}}
            output.write(json.dumps(metadata).encode() + b'\n')
        else:
            _, requested, filename, offset = parts
            assert requested == name and filename in FILES, 'File denied'
            assert re.fullmatch(r'\d{1,20}', offset), 'Invalid offset'
            path = bundle / filename
            start = int(offset)
            assert start <= path.stat().st_size, 'Offset exceeds file'
            with path.open('rb') as source:
                source.seek(start)
                for chunk in iter(lambda: source.read(1024**2), b''):
                    output.write(chunk)
        output.flush()

def main():
    try:
        serve(os.environ.get('SSH_ORIGINAL_COMMAND', ''), sys.stdout.buffer)
    except Exception:
        print('Backup export denied or temporarily unavailable.', file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
