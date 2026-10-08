#!/usr/bin/env python3
"""Create a read-only, encrypted project backup; test database restore in isolation."""
import datetime
import fcntl
import gzip
import hashlib
import hmac
import json
import os
import pathlib
import secrets
import shutil
import sqlite3
import subprocess
import tarfile
import tempfile

ROOT = pathlib.Path('/root/after-login-backups')
PUBLIC = pathlib.Path('/root/after-login-backup-public.pem')
CONTENT = pathlib.Path('/var/lib/docker/volumes/ghost_ghost_content/_data')
APP = pathlib.Path('/root/gostinaya')

def command(args, data=None, timeout=180):
    result = subprocess.run(args, input=data, capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError('Command failed: ' + args[0])
    return result.stdout

def mysql(query, database=None):
    args = ['docker', 'exec', '-i', 'ghost-db-1', 'sh', '-c',
            'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql '
            '--default-character-set=utf8mb4 --batch --raw --skip-column-names "$@"', 'sh']
    if database:
        args.append(database)
    return command(args, query.encode()).decode().splitlines()

def main():
    os.umask(0o077)
    ROOT.mkdir(mode=0o700, exist_ok=True)
    os.chmod(ROOT, 0o700)
    with (ROOT / '.backup.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        create()

def create():
    assert PUBLIC.is_file() and CONTENT.is_dir() and APP.is_dir()
    command(['openssl', 'pkey', '-pubin', '-in', str(PUBLIC), '-noout'])
    database = command(['docker','exec','ghost-db-1','sh','-c','printf "%s" "$MYSQL_DATABASE"']).decode().strip()
    assert database and all(c.isalnum() or c == '_' for c in database)
    # Worst-case full archive plus a safety reserve; existing snapshots stay untouched.
    size = sum(p.stat().st_size for p in CONTENT.rglob('*') if p.is_file() and not p.is_symlink())
    assert shutil.disk_usage(ROOT).free > size + 512 * 1024 * 1024, 'Insufficient free space'
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    bundle = ROOT / ('after-login-' + stamp)
    bundle.mkdir(mode=0o700)
    test_db = 'backup_verify_' + secrets.token_hex(6)
    assert test_db != database
    stage = pathlib.Path(tempfile.mkdtemp(prefix='.work-', dir=ROOT))
    tested = False
    try:
        print('1/5: SQLite snapshot', flush=True)
        original = sqlite3.connect('file:' + str(APP / 'database/gostinaya.db') + '?mode=ro', uri=True)
        copied = sqlite3.connect(stage / 'gostinaya.db')
        try:
            original.backup(copied)
            assert copied.execute('PRAGMA integrity_check').fetchall() == [('ok',)]
            assert not copied.execute('PRAGMA foreign_key_check').fetchall()
        finally:
            copied.close()
            original.close()

        print('2/5: Ghost SQL snapshot', flush=True)
        args = ['docker', 'exec', 'ghost-db-1', 'sh', '-c',
                'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump '
                '--single-transaction --quick --routines --triggers --events '
                '--no-tablespaces --set-gtid-purged=OFF --default-character-set=utf8mb4 "$1"',
                'sh', database]
        with tempfile.TemporaryFile() as errors:
            process = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=errors)
            try:
                with gzip.open(stage / 'ghost.sql.gz', 'wb', compresslevel=6) as destination:
                    shutil.copyfileobj(process.stdout, destination)
            finally:
                process.stdout.close()
            assert process.wait(timeout=180) == 0, 'Ghost SQL dump failed'
        assert (stage / 'ghost.sql.gz').stat().st_size > 100

        print('3/5: Isolated SQL restore test', flush=True)
        assert not mysql("SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='" + test_db + "';")
        schema = mysql("SELECT DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME "
                       "FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='" + database + "';")[0].split('\t')
        assert all(part.replace('_', '').isalnum() for part in schema)
        mysql('CREATE DATABASE `' + test_db + '` CHARACTER SET ' + schema[0] + ' COLLATE ' + schema[1] + ';')
        tested = True
        args = ['docker', 'exec', '-i', 'ghost-db-1', 'sh', '-c',
                'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --default-character-set=utf8mb4 "$1"', 'sh', test_db]
        with tempfile.TemporaryFile() as errors:
            process = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=errors)
            try:
                with gzip.open(stage / 'ghost.sql.gz', 'rb') as source:
                    shutil.copyfileobj(source, process.stdin)
            finally:
                process.stdin.close()
            assert process.wait(timeout=180) == 0, 'SQL restore failed'
        counts = mysql('SELECT COUNT(*) FROM posts; SELECT COUNT(*) FROM users; SELECT COUNT(*) FROM settings;', test_db)
        assert len(counts) == 3 and all(int(x) > 0 for x in counts)
        checks = mysql('CHECK TABLE posts, users, settings, integrations, api_keys;', test_db)
        assert len(checks) == 5 and all(x.endswith('\tstatus\tOK') for x in checks)
        mysql('DROP DATABASE `' + test_db + '`;')
        tested = False

        info = {'format': 'after-login-backup-v1', 'created_utc': stamp,
                'ghost_database': database, 'database_charset': schema,
                'ghost_restore_counts_posts_users_settings': counts,
                'sql_restore_test': 'OK', 'sqlite_integrity_and_foreign_keys': 'OK',
                'archive_consistency': 'Database snapshots; live files. Avoid publishing or deploying during backup.'}
        (stage / 'manifest.json').write_text(json.dumps(info, ensure_ascii=False, indent=2))
        for name in ('ghost-ghost-1', 'ghost-db-1'):
            (stage / (name + '-inspect.json')).write_bytes(command(['docker', 'inspect', name]))
        (stage / 'database-name.txt').write_text(database + '\n')
        (stage / 'gostinaya-git-head.txt').write_bytes(command(['git', '-C', str(APP), 'rev-parse', 'HEAD']))

        print('4/5: Encrypted file archive (may take several minutes)', flush=True)
        # Independent encryption password and MAC key, wrapped with RSA-OAEP-SHA256.
        material = secrets.token_bytes(64)
        password = material[:32].hex().encode()
        mac_key = material[32:]
        wrapped = command(['openssl', 'pkeyutl', '-encrypt', '-pubin', '-inkey', str(PUBLIC),
                           '-pkeyopt', 'rsa_padding_mode:oaep', '-pkeyopt', 'rsa_oaep_md:sha256'], material)
        (bundle / 'key.enc').write_bytes(wrapped)
        read_fd, write_fd = os.pipe()
        os.write(write_fd, password + b'\n')
        os.close(write_fd)
        encrypted = bundle / 'project.tar.gz.enc'
        with tempfile.TemporaryFile() as errors:
            process = subprocess.Popen(
                ['openssl', 'enc', '-aes-256-cbc', '-salt', '-pbkdf2', '-iter', '200000',
                 '-pass', 'fd:' + str(read_fd), '-out', str(encrypted)],
                stdin=subprocess.PIPE, stderr=errors, stdout=subprocess.DEVNULL, pass_fds=(read_fd,))
            os.close(read_fd)
            try:
                with tarfile.open(fileobj=process.stdin, mode='w|gz') as archive:
                    archive.add(stage, arcname='data')
                    archive.add(CONTENT, arcname='ghost-content')
                    def app_filter(member):
                        parts = pathlib.PurePosixPath(member.name).parts
                        if len(parts) > 1 and parts[1] in ('node_modules', '.git', 'database'):
                            return None
                        return member
                    archive.add(APP, arcname='gostinaya', filter=app_filter)
                    archive.add('/opt/ghost/compose.json', arcname='config/ghost/compose.json')
                    if pathlib.Path('/opt/ghost/.env').is_file():
                        archive.add('/opt/ghost/.env', arcname='config/ghost/.env')
                    for source, target in (('/etc/nginx', 'config/nginx'),
                                           ('/etc/letsencrypt', 'config/letsencrypt'),
                                           ('/var/lib/ghost-security-watch', 'config/security-watch-state'),
                                           ('/var/lib/ghost-release-watch', 'config/release-watch-state')):
                        assert pathlib.Path(source).is_dir(), 'Required directory missing'
                        archive.add(source, arcname=target)
                    for source in ('/usr/local/lib/ghost-security-watch.py',
                                   '/usr/local/lib/ghost-release-watch.py',
                                   '/etc/systemd/system/ghost-release-watch.service',
                                   '/etc/systemd/system/ghost-release-watch.timer',
                                   '/etc/systemd/system/after-login-backup.service',
                                   '/etc/systemd/system/after-login-backup.timer',
                                   '/usr/local/sbin/afterlogin-backup',
                                   '/usr/local/lib/after-login-backup.py',
                                   '/usr/local/lib/after-login-backup-daily.py',
                                   '/usr/local/lib/after-login-backup-export.py'):
                        archive.add(source, arcname='config/security-watch-files/' + pathlib.Path(source).name)
            except BaseException:
                process.kill()
                process.wait()
                raise
            finally:
                process.stdin.close()
            assert process.wait(timeout=180) == 0, 'Encryption failed'

        print('5/5: Archive authentication and checksums', flush=True)
        mac = hmac.new(mac_key, b'after-login-backup-v1\0' + wrapped, hashlib.sha256)
        sha = hashlib.sha256()
        with encrypted.open('rb') as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b''):
                mac.update(chunk)
                sha.update(chunk)
        (bundle / 'archive.hmac').write_text(mac.hexdigest() + '\n')
        (bundle / 'SHA256SUMS').write_text(
            sha.hexdigest() + '  project.tar.gz.enc\n' +
            hashlib.sha256(wrapped).hexdigest() + '  key.enc\n' +
            hashlib.sha256((bundle / 'archive.hmac').read_bytes()).hexdigest() + '  archive.hmac\n')
        (bundle / 'COMPLETE').write_text('after-login-backup-v1\n')
        (ROOT / 'latest.txt').write_text(bundle.name + '\n')
        print('BACKUP_CREATED_AND_DATABASE_RESTORE_TESTED_OK', flush=True)
        print('BUNDLE: ' + str(bundle), flush=True)
        print('ENCRYPTED_MIB: ' + str(round(encrypted.stat().st_size / 1024 / 1024, 1)), flush=True)
    finally:
        if tested:
            mysql('DROP DATABASE `' + test_db + '`;')
        shutil.rmtree(stage)

if __name__ == '__main__':
    main()
