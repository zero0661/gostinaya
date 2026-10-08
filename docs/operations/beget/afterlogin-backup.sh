#!/bin/bash
set -euo pipefail
umask 077
base=/var/backups/afterlogin
stamp=$(date -u +%Y%m%dT%H%M%SZ)
dest="$base/.partial-$stamp"
mkdir -m 700 "$dest"
docker exec ghost-db-1 sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --quick --no-tablespaces "$MYSQL_DATABASE"' 2>"$dest/mysql.log" | gzip > "$dest/ghost.sql.gz"
sqlite3 /root/gostinaya/database/gostinaya.db ".backup '$dest/gostinaya.db'"
test "$(sqlite3 "$dest/gostinaya.db" 'PRAGMA integrity_check;')" = ok
gzip -t "$dest/ghost.sql.gz"
tar -C /root/gostinaya --exclude=node_modules --exclude=.git --exclude=database/gostinaya.db --exclude='database/gostinaya.db-*' -czf "$dest/lounge-code-config.tar.gz" .
tar -C / -czf "$dest/server-config.tar.gz" opt/ghost/compose.json etc/nginx etc/letsencrypt
(cd "$dest" && sha256sum ghost.sql.gz gostinaya.db lounge-code-config.tar.gz server-config.tar.gz > SHA256SUMS)
mv "$dest" "$base/db-$stamp"
if [ "$(date -u +%u)" = 7 ] || ! compgen -G "$base/content-*.tar.gz" >/dev/null; then
 tar -C /var/lib/docker/volumes/ghost_ghost_content/_data -czf "$base/.content-$stamp.partial" .
 mv "$base/.content-$stamp.partial" "$base/content-$stamp.tar.gz"
 sha256sum "$base/content-$stamp.tar.gz" > "$base/content-$stamp.tar.gz.sha256"
fi
find "$base" -mindepth 1 -maxdepth 1 -type d -name 'db-*' -mtime +14 -exec rm -rf -- {} +
mapfile -t old < <(find "$base" -maxdepth 1 -name 'content-*.tar.gz' | sort -r | tail -n +3)
for path in "${old[@]}"; do rm -f -- "$path" "$path.sha256"; done
echo "BACKUP_OK $stamp"
