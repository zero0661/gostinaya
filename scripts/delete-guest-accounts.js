import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

function parseArguments(argv) {
  const emails = [];
  let apply = false;

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--apply') {
      apply = true;
      continue;
    }
    if (argv[index] === '--email' && argv[index + 1]) {
      emails.push(String(argv[index + 1]).trim().toLowerCase());
      index += 1;
    }
  }

  return { apply, emails: [...new Set(emails)].filter(Boolean) };
}

function placeholders(values) {
  return values.map(() => '?').join(', ');
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function tableExists(database, table) {
  return Boolean(database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?"
  ).get(table));
}

function getTargets(database, emails) {
  return database.prepare(`
    SELECT id, email, name, role
    FROM guests
    WHERE LOWER(email) IN (${placeholders(emails)})
    ORDER BY id
  `).all(...emails);
}

function count(database, sql, values = []) {
  return Number(database.prepare(sql).get(...values).total || 0);
}

function inspect(database, emails) {
  const targets = getTargets(database, emails);
  const targetIds = targets.map(row => Number(row.id));
  const missingEmails = emails.filter(email =>
    !targets.some(row => String(row.email).toLowerCase() === email)
  );

  if (!targetIds.length) {
    return { targets, targetIds, missingEmails, topics: [], counts: {} };
  }

  const ids = placeholders(targetIds);
  const topics = database.prepare(`
    SELECT
      t.id,
      t.room,
      t.title,
      CASE WHEN ad.topic_id IS NULL THEN 0 ELSE 1 END AS is_article,
      (SELECT COUNT(*) FROM discussion_messages m WHERE m.topic_id = t.id) AS messages_total,
      (SELECT COUNT(*) FROM discussion_messages m
       WHERE m.topic_id = t.id AND m.author_id NOT IN (${ids})) AS messages_from_others
    FROM discussion_topics t
    LEFT JOIN article_discussions ad ON ad.topic_id = t.id
    WHERE t.author_id IN (${ids})
    ORDER BY t.id
  `).all(...targetIds, ...targetIds);

  const preservedTopics = topics.filter(topic =>
    Number(topic.is_article) === 1 || Number(topic.messages_from_others) > 0
  );
  const deletedTopics = topics.filter(topic => !preservedTopics.includes(topic));
  const systemAuthor = preservedTopics.length
    ? database.prepare(`
        SELECT id, email, name, role
        FROM guests
        WHERE id NOT IN (${ids})
          AND role IN ('system', 'legacy')
        ORDER BY CASE role WHEN 'system' THEN 0 ELSE 1 END, id
        LIMIT 1
      `).get(...targetIds)
    : null;

  const counts = {
    messages: count(database,
      `SELECT COUNT(*) AS total FROM discussion_messages WHERE author_id IN (${ids})`,
      targetIds),
    repliesToMessages: count(database, `
      SELECT COUNT(*) AS total
      FROM discussion_messages
      WHERE parent_message_id IN (
        SELECT id FROM discussion_messages WHERE author_id IN (${ids})
      ) AND author_id NOT IN (${ids})
    `, [...targetIds, ...targetIds]),
    notifications: tableExists(database, 'notifications')
      ? count(database, `
          SELECT COUNT(*) AS total FROM notifications
          WHERE recipient_id IN (${ids}) OR actor_id IN (${ids})
             OR message_id IN (SELECT id FROM discussion_messages WHERE author_id IN (${ids}))
        `, [...targetIds, ...targetIds, ...targetIds])
      : 0,
    reads: tableExists(database, 'discussion_topic_reads')
      ? count(database,
          `SELECT COUNT(*) AS total FROM discussion_topic_reads WHERE guest_id IN (${ids})`,
          targetIds)
      : 0
  };

  return {
    targets,
    targetIds,
    missingEmails,
    topics,
    preservedTopics,
    deletedTopics,
    systemAuthor,
    counts
  };
}

function printReport(report) {
  console.log(`Accounts found: ${report.targets.length}`);
  for (const target of report.targets) {
    console.log(`  #${target.id}: ${target.email} (${target.name}; ${target.role})`);
  }
  if (report.missingEmails.length) {
    console.log(`Accounts not found: ${report.missingEmails.join(', ')}`);
  }
  if (!report.targetIds.length) return;

  console.log(`Authored messages to delete: ${report.counts.messages}`);
  console.log(`Replies by other users to preserve: ${report.counts.repliesToMessages}`);
  console.log(`Notifications to delete: ${report.counts.notifications}`);
  console.log(`Read markers to delete: ${report.counts.reads}`);
  console.log(`Authored topics: ${report.topics.length}`);
  console.log(`  Topics to delete: ${report.deletedTopics.length}`);
  console.log(`  Topics to preserve: ${report.preservedTopics.length}`);

  for (const topic of report.deletedTopics) {
    console.log(`  Delete topic #${topic.id}: ${topic.title}`);
  }
  for (const topic of report.preservedTopics) {
    console.log(`  Preserve topic #${topic.id}: ${topic.title}${Number(topic.is_article) ? ' [article]' : ''}`);
  }
  if (report.preservedTopics.length) {
    console.log(report.systemAuthor
      ? `Preserved-topic author: #${report.systemAuthor.id} ${report.systemAuthor.name}`
      : 'Preserved-topic author: NOT FOUND');
  }
}

function cleanSessions(sessionDirectory, targetIds) {
  let removed = 0;
  let unreadable = 0;

  try {
    for (const entry of readdirSync(sessionDirectory, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const filePath = path.join(sessionDirectory, entry.name);
      try {
        const session = JSON.parse(readFileSync(filePath, 'utf8'));
        if (targetIds.includes(Number(session?.guest?.id))) {
          unlinkSync(filePath);
          removed += 1;
        }
      } catch {
        unreadable += 1;
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  return { removed, unreadable };
}

function applyDeletion(database, report) {
  const ids = placeholders(report.targetIds);
  const deletedTopicIds = report.deletedTopics.map(topic => Number(topic.id));
  const preservedTopicIds = report.preservedTopics.map(topic => Number(topic.id));

  if (preservedTopicIds.length && !report.systemAuthor) {
    throw new Error('No system or legacy account exists for preserved topics; nothing changed.');
  }

  database.exec('BEGIN IMMEDIATE');
  try {
    if (tableExists(database, 'notifications')) {
      database.prepare(`
        DELETE FROM notifications
        WHERE recipient_id IN (${ids}) OR actor_id IN (${ids})
           OR message_id IN (SELECT id FROM discussion_messages WHERE author_id IN (${ids}))
      `).run(...report.targetIds, ...report.targetIds, ...report.targetIds);
    }

    if (tableExists(database, 'discussion_topic_reads')) {
      database.prepare(
        `DELETE FROM discussion_topic_reads WHERE guest_id IN (${ids})`
      ).run(...report.targetIds);
    }

    database.prepare(`
      UPDATE discussion_messages
      SET parent_message_id = NULL
      WHERE parent_message_id IN (
        SELECT id FROM discussion_messages WHERE author_id IN (${ids})
      ) AND author_id NOT IN (${ids})
    `).run(...report.targetIds, ...report.targetIds);

    database.prepare(
      `DELETE FROM discussion_messages WHERE author_id IN (${ids})`
    ).run(...report.targetIds);

    if (preservedTopicIds.length) {
      database.prepare(`
        UPDATE discussion_topics
        SET author_id = ?
        WHERE id IN (${placeholders(preservedTopicIds)})
      `).run(Number(report.systemAuthor.id), ...preservedTopicIds);
    }

    if (deletedTopicIds.length) {
      const topicIds = placeholders(deletedTopicIds);
      if (tableExists(database, 'notifications')) {
        database.prepare(`DELETE FROM notifications WHERE topic_id IN (${topicIds})`)
          .run(...deletedTopicIds);
      }
      if (tableExists(database, 'discussion_topic_reads')) {
        database.prepare(`DELETE FROM discussion_topic_reads WHERE topic_id IN (${topicIds})`)
          .run(...deletedTopicIds);
      }
      if (tableExists(database, 'article_discussions')) {
        database.prepare(`DELETE FROM article_discussions WHERE topic_id IN (${topicIds})`)
          .run(...deletedTopicIds);
      }
      database.prepare(`DELETE FROM discussion_messages WHERE topic_id IN (${topicIds})`)
        .run(...deletedTopicIds);
      database.prepare(`DELETE FROM discussion_topics WHERE id IN (${topicIds})`)
        .run(...deletedTopicIds);
    }

    database.prepare(`DELETE FROM guests WHERE id IN (${ids})`).run(...report.targetIds);
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function verify(database, emails, targetIds) {
  const remainingAccounts = count(database,
    `SELECT COUNT(*) AS total FROM guests WHERE LOWER(email) IN (${placeholders(emails)})`,
    emails);
  const ids = placeholders(targetIds);
  const remainingReferences = [
    count(database, `SELECT COUNT(*) AS total FROM discussion_topics WHERE author_id IN (${ids})`, targetIds),
    count(database, `SELECT COUNT(*) AS total FROM discussion_messages WHERE author_id IN (${ids})`, targetIds),
    tableExists(database, 'notifications')
      ? count(database, `SELECT COUNT(*) AS total FROM notifications WHERE recipient_id IN (${ids}) OR actor_id IN (${ids})`, [...targetIds, ...targetIds])
      : 0,
    tableExists(database, 'discussion_topic_reads')
      ? count(database, `SELECT COUNT(*) AS total FROM discussion_topic_reads WHERE guest_id IN (${ids})`, targetIds)
      : 0
  ].reduce((sum, value) => sum + value, 0);

  if (remainingAccounts || remainingReferences) {
    throw new Error(`Verification failed: accounts=${remainingAccounts}; references=${remainingReferences}`);
  }
}

function main() {
  const { apply, emails } = parseArguments(process.argv.slice(2));
  if (!emails.length) {
    throw new Error('Pass one or more accounts with --email address@example.com');
  }

  const databasePath = process.env.GOSTINAYA_DB_PATH ||
    path.join(dirname, '..', 'database', 'gostinaya.db');
  const database = new DatabaseSync(databasePath);

  try {
    const report = inspect(database, emails);
    printReport(report);

    if (!report.targetIds.length) {
      console.log('Nothing to delete.');
      return;
    }
    if (!apply) {
      console.log('Dry run passed. Nothing changed. Run again with --apply.');
      return;
    }

    const backupDirectory = path.join(path.dirname(databasePath), 'backups');
    const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    const backupPath = path.join(backupDirectory, `gostinaya-before-account-deletion-${timestamp}-${randomUUID().slice(0, 8)}.db`);
    mkdirSync(backupDirectory, { recursive: true });
    database.exec(`VACUUM INTO ${sqlString(backupPath)}`);

    applyDeletion(database, report);
    verify(database, emails, report.targetIds);

    const sessionDirectory = path.join(path.dirname(databasePath), 'sessions');
    const sessions = cleanSessions(sessionDirectory, report.targetIds);
    console.log(`Backup: ${backupPath}`);
    console.log(`Sessions removed: ${sessions.removed}`);
    if (sessions.unreadable) console.log(`Unreadable session files skipped: ${sessions.unreadable}`);
    console.log('Account deletion completed and verified.');
  } finally {
    database.close();
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
