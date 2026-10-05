#!/usr/bin/env python3
"""Notify owner of official Ghost releases/advisory changes; never update Ghost."""
import datetime
import fcntl
import hashlib
import importlib.util
import json
import pathlib
import re
import sys
import urllib.request

ROOT = pathlib.Path('/var/lib/ghost-release-watch')
API = 'https://api.github.com/repos/TryGhost/Ghost/'

def fetch(url):
    assert url.startswith(API)
    request = urllib.request.Request(url, headers={'User-Agent': 'AfterLogin-Ghost-Security-Watch',
                                                  'Accept': 'application/vnd.github+json'})
    with urllib.request.urlopen(request, timeout=30) as response:
        body = response.read(8 * 1024**2 + 1)
        assert len(body) <= 8 * 1024**2, 'Oversized GitHub response'
        return json.loads(body), response.headers.get('Link', '')

def version(text):
    match = re.fullmatch(r'v?(\d+)\.(\d+)\.(\d+)', text)
    assert match, 'Unrecognized stable Ghost version'
    return tuple(map(int, match.groups()))

def collect(watcher, config):
    installed = watcher.run([config['docker'], 'exec', 'ghost-ghost-1', 'node', '-p',
                             "require('/var/lib/ghost/current/package.json').version"]).strip()
    version(installed)
    release, _ = fetch(API + 'releases/latest')
    assert not release['draft'] and not release['prerelease']
    version(release['tag_name'])
    assert release['html_url'].startswith('https://github.com/TryGhost/Ghost/releases/')
    advisories = {}
    url = API + 'security-advisories?state=published&per_page=100'
    for page in range(10):
        rows, links = fetch(url)
        assert isinstance(rows, list)
        for item in rows:
            identity = item['ghsa_id']
            assert re.fullmatch(r'GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}', identity)
            assert item['html_url'].startswith('https://github.com/TryGhost/Ghost/security/advisories/')
            selected = {k: item.get(k) for k in ('ghsa_id', 'cve_id', 'summary', 'severity', 'html_url',
                                                'published_at', 'withdrawn_at', 'vulnerabilities')}
            selected['signature'] = hashlib.sha256(json.dumps(selected, sort_keys=True).encode()).hexdigest()
            advisories[identity] = selected
        next_link = re.search(r'<([^>]+)>;\s*rel="next"', links)
        if not next_link:
            break
        url = next_link.group(1)
    else:
        raise RuntimeError('Advisory pagination limit exceeded')
    return {'installed': installed, 'release': release['tag_name'], 'release_url': release['html_url'],
            'advisories': advisories}

def message(old, current, initial=False):
    changed = [a for key, a in current['advisories'].items()
               if key not in old.get('advisories', {}) or
               a['signature'] != old['advisories'][key]['signature']]
    upgrade = version(current['release']) > version(current['installed'])
    release_changed = upgrade and (old.get('release'), old.get('installed')) != (current['release'], current['installed'])
    if not initial and not changed and not release_changed:
        return None
    lines = ['Версия работающего Ghost: ' + current['installed'],
             'Последний официальный стабильный релиз: ' + current['release'], current['release_url']]
    if upgrade:
        lines.append('Доступно обновление. Перед установкой нужны резервная копия и проверка совместимости.')
    if initial:
        lines.append('Ежедневный контроль включён. Зафиксированы ' + str(len(current['advisories'])) +
                     ' опубликованных advisories; новые сообщения и изменения будут присылаться отдельно.')
    else:
        for item in changed:
            lines.extend(['', (item.get('cve_id') or item['ghsa_id']) + ' [' + item['severity'] + ']',
                          item['summary'], item['html_url']])
            for affected in item.get('vulnerabilities') or []:
                lines.append('Пакет: ' + str(affected.get('package', {}).get('name')) +
                             '; затронутые версии: ' + str(affected.get('vulnerable_version_range')) +
                             '; исправлено: ' + str(affected.get('patched_versions')))
        if changed:
            lines.append('Сообщения относятся к Ghost; применимость каждого диапазона к установленной версии требует проверки.')
    lines.append('Скрипт не устанавливает обновления и не меняет сайт.')
    return '\n'.join(lines)

def main():
    import os
    os.umask(0o077)
    ROOT.mkdir(mode=0o700, exist_ok=True)
    spec = importlib.util.spec_from_file_location('security_mail', '/usr/local/lib/ghost-security-watch.py')
    watcher = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(watcher)
    config = json.loads(watcher.CONFIG.read_text())
    initial = len(sys.argv) > 1 and sys.argv[1] == 'init'
    state = ROOT / 'state.json'
    failure = ROOT / 'failure.json'
    with (ROOT / '.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        assert not initial or not state.exists(), 'Monitor already initialized'
        old = json.loads(state.read_text()) if state.exists() else {}
        try:
            current = collect(watcher, config)
        except Exception as error:
            now = datetime.datetime.now(datetime.timezone.utc)
            sent = json.loads(failure.read_text()).get('sent_at') if failure.exists() else None
            if not sent or (now - datetime.datetime.fromisoformat(sent)).total_seconds() >= 86400:
                watcher.send(config, '[После логина] Не удалось проверить обновления Ghost',
                             'Проверка официальных релизов/advisories не завершена. Тип ошибки: ' +
                             type(error).__name__ + '. Проверьте journalctl -u ghost-release-watch.service -n 30.')
                watcher.write_json(failure, {'sent_at': now.isoformat()})
            raise RuntimeError('Official release/advisory check failed') from None
        body = message(old, current, initial=initial or not state.exists())
        if body:
            watcher.send(config, '[После логина] Контроль обновлений Ghost', body)
            print('RELEASE_WATCH_MAIL_ACCEPTED_BY_SMTP', flush=True)
        elif failure.exists():
            watcher.send(config, '[После логина] Проверка обновлений Ghost восстановлена',
                         'Официальные релизы и advisories снова успешно проверяются.')
        watcher.write_json(state, current)
        if failure.exists():
            failure.unlink()
        print('GHOST_RELEASE_WATCH_OK: installed=' + current['installed'] + ' latest=' + current['release'] +
              ' advisories=' + str(len(current['advisories'])), flush=True)

if __name__ == '__main__':
    main()
