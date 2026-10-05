#!/usr/bin/env python3
"""Read-only Ghost security snapshot. Deployment configuration stays on VPS."""
import argparse
import datetime
import hashlib
import json
import os
import pathlib
import subprocess
import sys
from html.parser import HTMLParser

ROOT = pathlib.Path('/var/lib/ghost-security-watch')
CONFIG = ROOT / 'config.json'
BASELINE = ROOT / 'baseline.json'
STATE = ROOT / 'notification-state.json'

def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))

def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()

def write_json(path, value):
    tmp = path.with_suffix('.tmp')
    with tmp.open('w') as f:
        os.chmod(tmp, 0o600)
        f.write(canonical(value) + '\n')
    tmp.replace(path)

def run(args, **kwargs):
    r = subprocess.run(args, capture_output=True, text=True, timeout=50, **kwargs)
    if r.returncode:
        raise RuntimeError('Command failed: ' + args[0])
    return r.stdout

def mysql(config, query):
    db = config['database']
    if not db or not all(c.isalnum() or c == '_' for c in db):
        raise RuntimeError('Invalid database name')
    return run([config['docker'], 'exec', '-i', 'ghost-db-1', 'sh', '-c',
                'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql '
                '--default-character-set=utf8mb4 --batch --raw --skip-column-names "$1"',
                'sh', db], input=query).splitlines()

class CodeBlocks(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.blocks = []
        self.script = None

    def handle_starttag(self, tag, attrs):
        if tag == 'script':
            self.script = self.get_starttag_text()
        elif (tag in ('iframe', 'form', 'object', 'embed', 'base')
              or any(k.startswith('on') or k == 'srcdoc' for k, v in attrs)
              or (tag == 'meta' and dict(attrs).get('http-equiv', '').lower() == 'refresh')):
            self.blocks.append([tag, sorted(attrs, key=lambda x: x[0])])

    def handle_data(self, data):
        if self.script is not None:
            self.script += data

    def handle_endtag(self, tag):
        if tag == 'script' and self.script is not None:
            self.blocks.append(self.script + '</script>')
            self.script = None

def snapshot(config):
    wanted = {
        'settings': ['key', 'value'],
        'users': ['id', 'name', 'slug', 'status'],
        'roles': ['id', 'name'],
        'roles_users': ['user_id', 'role_id'],
        'integrations': ['id', 'name', 'slug'],
        'api_keys': ['id', 'type', 'integration_id', 'user_id', 'secret'],
        'webhooks': ['id', 'event', 'name', 'status', 'target_url', 'secret'],
        'posts': ['id', 'codeinjection_head', 'codeinjection_foot', 'html'],
    }
    schema = {}
    for line in mysql(config, 'SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS '
                             'WHERE TABLE_SCHEMA = DATABASE();'):
        table, column = line.split('\t')
        schema.setdefault(table, set()).add(column)
    for table, fields in wanted.items():
        required = set(fields) - {'slug', 'name', 'status', 'secret'}
        if table not in schema or not required.issubset(schema[table]):
            raise RuntimeError('Unexpected schema: ' + table)
    if 'secret' not in schema['api_keys']:
        raise RuntimeError('API secret column missing')
    statements = ['START TRANSACTION WITH CONSISTENT SNAPSHOT;']
    for table, fields in wanted.items():
        pairs = []
        for field in fields:
            if field not in schema[table]:
                continue
            expr = '`' + field + '`'
            if field in ('secret', 'target_url', 'codeinjection_head', 'codeinjection_foot'):
                expr = "SHA2(COALESCE(" + expr + ", ''), 256)"
            pairs += ["'" + field + "'", expr]
        where = " WHERE `key` IN ('active_theme','codeinjection_head','codeinjection_foot')" if table == 'settings' else ''
        statements.append("SELECT JSON_OBJECT('section', '" + table + "', 'row', JSON_OBJECT(" +
                          ', '.join(pairs) + ')) FROM `' + table + '`' + where + ';')
    statements.append('COMMIT;')
    result = {key: [] for key in wanted}
    for line in mysql(config, '\n'.join(statements)):
        item = json.loads(line)
        row = item['row']
        if item['section'] == 'settings' and row['key'] != 'active_theme':
            row['value'] = digest(row['value'])
        if item['section'] == 'posts':
            parser = CodeBlocks()
            parser.feed(row.pop('html') or '')
            if parser.script is not None:
                parser.blocks.append(parser.script)
            row['active_html'] = digest(parser.blocks) if parser.blocks else None
            empty = hashlib.sha256(b'').hexdigest()
            if not row['active_html'] and row['codeinjection_head'] == empty and row['codeinjection_foot'] == empty:
                continue
        result[item['section']].append(row)
    for key in result:
        result[key].sort(key=canonical)
    theme_rows = [r for r in result['settings'] if r['key'] == 'active_theme']
    if len(theme_rows) != 1:
        raise RuntimeError('Active theme missing')
    theme = theme_rows[0]['value']
    try:
        theme = json.loads(theme)
    except (ValueError, TypeError):
        pass
    if not isinstance(theme, str) or not theme or '/' in theme or theme in ('.', '..'):
        raise RuntimeError('Invalid active theme')
    themes = pathlib.Path('/var/lib/docker/volumes/ghost_ghost_content/_data/themes')
    folder = themes / theme
    if not folder.is_dir():
        raise RuntimeError('Active theme folder missing')
    result['theme_directories'] = sorted(p.name for p in themes.iterdir() if p.is_dir())
    result['theme_files'] = []
    for p in sorted(folder.rglob('*')):
        relative = str(p.relative_to(folder))
        if p.is_symlink():
            result['theme_files'].append([relative, 'symlink', os.readlink(p)])
        elif p.is_file():
            h = hashlib.sha256()
            with p.open('rb') as f:
                for chunk in iter(lambda: f.read(1024 * 1024), b''):
                    h.update(chunk)
            result['theme_files'].append([relative, h.hexdigest()])
    info = json.loads(run([config['docker'], 'inspect', 'ghost-ghost-1']))[0]
    result['container'] = {'image': info['Config']['Image'], 'ports': info['HostConfig']['PortBindings']}
    return result

def send(config, subject, body):
    code = """import {sendMail} from './utils/mailer.js';
let input=''; for await (const chunk of process.stdin) input+=chunk;
try {const r=await sendMail(JSON.parse(input));
if (!r.accepted?.length || r.rejected?.length) process.exit(1);
process.exit(0);} catch {process.exit(1);}
"""
    run([config['node'], '--input-type=module', '-e', code], cwd='/root/gostinaya',
        input=json.dumps({'to': config['recipient'], 'subject': subject, 'text': body}))

def changes(old, new):
    return sorted(k for k in set(old) | set(new) if old.get(k) != new.get(k))

def notify(config, event):
    state = json.loads(STATE.read_text()) if STATE.exists() else {}
    now = datetime.datetime.now(datetime.timezone.utc)
    signature = digest(event)
    last = datetime.datetime.fromisoformat(state['sent_at']) if state.get('sent_at') else None
    if state.get('signature') == signature and last and (now-last).total_seconds() < 86400:
        print('ALERT_PENDING ' + ', '.join(event.get('sections', [])))
        return
    body = ('Контроль безопасности milenin.pro\nВремя UTC: ' + now.isoformat() +
            '\nСобытие: ' + event['kind'] + '\nРазделы: ' +
            ', '.join(event.get('sections', [])) +
            '\n\nИзменение требует проверки. Оно может быть результатом вашего обслуживания сайта.'
            '\nСекреты и содержимое базы в письмо не включены. Проверка ничего не исправляет автоматически.')
    send(config, '[После логина] ' + event['kind'], body)
    write_json(STATE, {'signature': signature, 'sent_at': now.isoformat(), 'kind': event['kind']})
    print('ALERT_SENT')

def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=('init', 'check', 'accept', 'test-mail'))
    args = parser.parse_args()
    config = json.loads(CONFIG.read_text())
    if args.action == 'test-mail':
        send(config, '[После логина] Проверка уведомлений безопасности',
             'Тест доставки. После включения таймера проверка будет выполняться каждые пять минут.'
             '\nЭто тестовое письмо, а не сообщение об атаке.')
        print('TEST_MAIL_ACCEPTED_BY_SMTP')
        return
    if args.action in ('init', 'accept'):
        if args.action == 'init' and BASELINE.exists():
            raise RuntimeError('Baseline already exists; init will not replace it')
        current = snapshot(config)
        if BASELINE.exists():
            stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
            write_json(ROOT / ('baseline-before-' + stamp + '.json'), json.loads(BASELINE.read_text()))
        write_json(BASELINE, current)
        write_json(STATE, {})
        print('BASELINE_SAVED')
        return
    try:
        baseline = json.loads(BASELINE.read_text())
        current = snapshot(config)
        changed = changes(baseline, current)
    except Exception:
        notify(config, {'kind': 'Проверка безопасности не выполнена', 'sections': ['collection_error']})
        raise RuntimeError('Security snapshot failed') from None
    if changed:
        notify(config, {'kind': 'Изменение настроек безопасности', 'sections': changed, 'fingerprint': digest(current)})
    else:
        state = json.loads(STATE.read_text()) if STATE.exists() else {}
        if state.get('kind'):
            notify(config, {'kind': 'Состояние снова соответствует контрольному снимку', 'sections': []})
            write_json(STATE, {})
        print('SECURITY_WATCH_OK')

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('SECURITY_WATCH_FAILED: ' + str(error), file=sys.stderr)
        sys.exit(1)
