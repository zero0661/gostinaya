#!/usr/bin/env node
import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import Ghost from '../services/GhostApiService.js';
import { legacyMigrationPlan } from '../services/LegacyNewsletterMigration.js';

const apply = process.argv.includes('--apply');
const newsletters = await Ghost.listNewsletters();
const members = await Ghost.listMembers();
const plan = legacyMigrationPlan(newsletters, members);
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...plan }, null, 2));
if (apply) {
  const backupDir = process.env.GOSTINAYA_BACKUP_DIR || '/root/gostinaya/database/backups';
  await mkdir(backupDir, { recursive: true, mode: 0o700 });
  const backup = `${backupDir}/newsletter-members-before-migration-${Date.now()}.json`;
  await writeFile(backup, JSON.stringify({ newsletters, members }, null, 2), { mode: 0o600, flag: 'wx' });
  console.log(`Backup: ${backup}`);
  for (const member of plan.migrate) {
    await Ghost.subscribeMember({ email: member.email, newsletterName: 'После логина — RU', labelName: 'После логина RU' });
    if (!await Ghost.isMemberSubscribed({ email: member.email, newsletterName: 'После логина — RU' })) {
      throw new Error(`Migration verification failed for member ${member.id}`);
    }
  }
  if (plan.legacy && !plan.review.length) {
    // Remove the obsolete membership only after RU membership has been verified.
    for (const member of members) {
      if (!(member.newsletters || []).some(item => item.id === plan.legacy.id)) continue;
      if (member.subscribed === false || member.email_suppression?.suppressed === true) continue;
      if (!await Ghost.isMemberSubscribed({ email: member.email, newsletterName: 'После логина — RU' })) {
        throw new Error(`Cannot remove legacy membership for member ${member.id}`);
      }
      const updated = await Ghost.unsubscribeMember({ memberId: member.id, email: member.email, newsletterName: plan.legacy.name });
      if (!updated?.id || (updated.newsletters || []).some(item => item.id === plan.legacy.id)) {
        throw new Error(`Legacy removal verification failed for member ${member.id}`);
      }
    }
    await Ghost.archiveNewsletter(plan.legacy.id);
    console.log('Obsolete newsletter archived after verified migration.');
  }
  console.log(`Verified migrated members: ${plan.migrate.length}; manual review: ${plan.review.length}`);
}
