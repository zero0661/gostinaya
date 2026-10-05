#!/usr/bin/env python3
"""Patch the inspected Liebling related-post block. Dry run by default."""
import argparse
import datetime
import hashlib
from pathlib import Path
import re
import subprocess

ROOT = Path('/var/lib/docker/volumes/ghost_ghost_content/_data/themes/liebling')
OLD_FILTER = 'tags:[{{post.tags}}]+id:-{{post.id}}'
MARKER = '{{!-- after-login-recommendations-language-v1 --}}'

def transform(source):
    if MARKER in source:
        return source
    pattern = r'(?P<indent>[ \t]*){{#if post\.tags\.length}}\s*{{#get "posts"[^\n]*filter="tags:\[{{post\.tags}}\]\+id:-{{post\.id}}"[^\n]*}}[\s\S]*?{{/get}}\s*{{/if}}'
    matches = list(re.finditer(pattern, source))
    if len(matches) != 1:
        raise ValueError('Expected exactly one inspected related-post block; no changes made')
    match = matches[0]
    block = match.group(0)
    query_start = block.index('{{#get')
    query_end = block.rindex('{{/get}}') + len('{{/get}}')
    query = block[query_start:query_end]
    heading = '{{#post}}{{#has tag="English"}}Recommended{{else}}{{t "Recommended for you"}}{{/has}}{{else}}{{t "Recommended for you"}}{{/post}}'
    if query.count(heading) != 1 or query.count('{{> "loop"}}') != 1:
        raise ValueError('Unexpected heading or cards; no changes made')
    def version(language):
        tag = 'tag:english' if language == 'en' else 'tag:-english'
        result = query.replace(OLD_FILTER, 'tags:[{{tags}}]+id:-{{id}}+' + tag)
        return result.replace(heading, 'Recommended' if language == 'en' else '{{t "Recommended for you"}}')
    replacement = '\n'.join([MARKER, '{{#post}}', '{{#if tags.length}}', '{{#has tag="English"}}', version('en'), '{{else}}', version('ru'), '{{/has}}', '{{/if}}', '{{/post}}'])
    return source[:match.start()] + replacement + source[match.end():]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    target = ROOT / 'post.hbs'
    source = target.read_text()
    updated = transform(source)
    if source == updated:
        print('ALREADY_FIXED: no changes')
        return
    print('READY: EN tag:english; RU tag:-english; current post excluded; limit 3 and shared tags preserved')
    if not args.apply:
        print('DRY_RUN_OK: no files changed')
        return
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup = Path('/root/ghost-theme-backups') / ('recommendations-language-' + stamp)
    backup.mkdir(parents=True, exist_ok=False)
    (backup / 'post.hbs').write_text(source)
    try:
        if target.read_text() != source:
            raise RuntimeError('Theme changed during preparation; rerun')
        target.write_text(updated)
        if hashlib.sha256(target.read_bytes()).digest() != hashlib.sha256(updated.encode()).digest():
            raise RuntimeError('Written theme checksum mismatch')
        subprocess.run(['docker', 'restart', 'ghost-ghost-1'], check=True)
        state = subprocess.check_output(['docker', 'inspect', '-f', '{{.State.Running}}', 'ghost-ghost-1'], text=True).strip()
        if state != 'true':
            raise RuntimeError('Ghost container is not running')
    except Exception:
        target.write_text(source)
        subprocess.run(['docker', 'restart', 'ghost-ghost-1'], check=True)
        raise
    print('BACKUP:', backup)
    print('RECOMMENDATIONS_LANGUAGE_FIXED: container running; check RU/EN articles in browser')

if __name__ == '__main__':
    main()
