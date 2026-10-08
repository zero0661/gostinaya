# Beget: encrypted Mac backups and Ghost release notifications
Installed 2026-10-08. Runtime Ghost remains 6.67.0; this does not upgrade Ghost.
## Schedule
- Existing local logical backup: 01:00 UTC / 04:00 Moscow, afterlogin-backup.timer.
- Encrypted complete project backup with isolated MySQL restore check: 01:30 UTC / 04:30 Moscow, after-login-backup.timer. Two completed encrypted bundles retained on Beget.
- Official GitHub stable releases and repository advisories: 03:00 UTC / 06:00 Moscow, ghost-release-watch.timer. No automatic installation.
- Mac LaunchAgent pro.milenin.after-login-backup: once per hour in the logged-in user session. Mac must be awake and online. Program download-beget-backup.py.
## Storage and verification
Beget: /root/after-login-backups, encrypted after-login-YYYYMMDDTHHMMSSZ bundles.
Mac: ~/AfterLoginBackups/Beget. RSA private key remains ~/AfterLoginBackups/private.pem; never copy to VPS or Git. Download key has a forced-command restriction permitting only latest metadata and encrypted file export.
Downloader uses pinned Beget SSH host key, resumable files, SHA256 hashes, RSA-OAEP-SHA256, HMAC-SHA256, AES-256-CBC with PBKDF2 200000 iterations, full gzip read, safe archive paths, SQL dump inspection, SQLite integrity and foreign-key checks. Temporary plaintext verification files are deleted. Three verified Beget bundles retained on Mac; historical Fornex folders remain untouched.
Archive includes consistent DB snapshots, live Ghost content and application/configuration files (including secrets, encrypted). Avoid deployments and publishing during backup; this is not an atomic VM snapshot.
Release mail helper loads current Beget SMTP from the application; no legacy SMTP credentials transferred. Historical alert recipient preserved in private config. ghost-security-watch.py is installed as a mail helper only; the five-minute security watch baseline/timer is NOT activated by this change.
## Operator commands
systemctl start after-login-backup.service
journalctl -u after-login-backup.service -n 30 --no-pager
systemctl start ghost-release-watch.service
journalctl -u ghost-release-watch.service -n 30 --no-pager
systemctl list-timers after-login-backup.timer ghost-release-watch.timer --no-pager
Mac: python3 ~/AfterLoginBackups/download-beget-backup.py
Failures retain previously completed bundles. Offsite success requires the Mac download/verifier result, not only server BACKUP_CREATED.
Old Fornex monitoring/backup timers are still historical; do not restart old applications or assume old backups contain new Beget data.

## Verified 2026-10-08
Real bundle after-login-20261008T183002Z: isolated server MySQL restore OK; 1493.1 MiB encrypted. Mac real LaunchAgent download, SHA256/HMAC/decryption/full gzip/SQLite checks passed. Verification marker exists. Repeat 21:38 Moscow returned LATEST_OFFSITE_BACKUP_ALREADY_VERIFIED, LaunchAgent last exit code 0. Server release check found 6.69.0 vs installed 6.67.0; SMTP accepted notice; repeat produced no duplicate. Old Fornex ghost-release-watch.timer and after-login-backup.timer disabled/inactive only after new Mac verification. Historical files, archives and other services preserved. Nightly scheduled run and reboot not yet tested.
