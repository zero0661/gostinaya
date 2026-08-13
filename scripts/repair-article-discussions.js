import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function openDatabase(databasePath) {
  const { default: sqlite3 } = await import('sqlite3');
  const database = new sqlite3.Database(databasePath);
  return {
    database,
    all(sql, params = []) {
      return new Promise((resolve, reject) => database.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows)));
    },
    get(sql, params = []) {
      return new Promise((resolve, reject) => database.get(sql, params, (error, row) => error ? reject(error) : resolve(row)));
    },
    run(sql, params = []) {
      return new Promise((resolve, reject) => database.run(sql, params, function onRun(error) {
        error ? reject(error) : resolve(this);
      }));
    },
    close() {
      return new Promise((resolve, reject) => database.close(error => error ? reject(error) : resolve()));
    }
  };
}

function normalized(value) {
  const text = String(value || '').trim();
  return text || null;
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function articleKey(row) {
  return JSON.stringify([
    normalized(row.ghost_post_id_ru),
    normalized(row.ghost_post_id_en),
    normalized(row.url_ru),
    normalized(row.url_en)
  ]);
}

function hasArticleIdentity(row) {
  return Boolean(
    normalized(row.ghost_post_id_ru) ||
    normalized(row.ghost_post_id_en) ||
    normalized(row.url_ru) ||
    normalized(row.url_en)
  );
}

async function tableExists(db, table) {
  return Boolean(await db.get(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
    [table]
  ));
}

async function moveTopicReferences(db, primaryTopicId, duplicateTopicId, tables) {
  await db.run(
    'UPDATE discussion_messages SET topic_id = ? WHERE topic_id = ?',
    [primaryTopicId, duplicateTopicId]
  );

  if (tables.notifications) {
    await db.run(
      'UPDATE notifications SET topic_id = ? WHERE topic_id = ?',
      [primaryTopicId, duplicateTopicId]
    );
  }

  if (tables.reads) {
    await db.run(`INSERT INTO discussion_topic_reads
      (guest_id, topic_id, last_read_message_id, last_read_at)
      SELECT guest_id, ?, last_read_message_id, last_read_at
      FROM discussion_topic_reads
      WHERE topic_id = ?
      ON CONFLICT(guest_id, topic_id) DO UPDATE SET
        last_read_message_id = CASE
          WHEN excluded.last_read_at > discussion_topic_reads.last_read_at
          THEN excluded.last_read_message_id
          ELSE discussion_topic_reads.last_read_message_id
        END,
        last_read_at = CASE
          WHEN excluded.last_read_at > discussion_topic_reads.last_read_at
          THEN excluded.last_read_at
          ELSE discussion_topic_reads.last_read_at
        END`, [primaryTopicId, duplicateTopicId]);
    await db.run(
      'DELETE FROM discussion_topic_reads WHERE topic_id = ?',
      [duplicateTopicId]
    );
  }

  await db.run('DELETE FROM article_discussions WHERE topic_id = ?', [duplicateTopicId]);
  await db.run('DELETE FROM discussion_topics WHERE id = ?', [duplicateTopicId]);
}

async function removeEmptyDiscussion(db, topicId, tables) {
  if (tables.notifications) {
    await db.run('DELETE FROM notifications WHERE topic_id = ?', [topicId]);
  }
  if (tables.reads) {
    await db.run('DELETE FROM discussion_topic_reads WHERE topic_id = ?', [topicId]);
  }
  await db.run('DELETE FROM article_discussions WHERE topic_id = ?', [topicId]);
  await db.run('DELETE FROM discussion_topics WHERE id = ?', [topicId]);
}

async function createUniqueIndexes(db) {
  const columns = [
    'ghost_post_id_ru',
    'ghost_post_id_en',
    'url_ru',
    'url_en'
  ];

  for (const column of columns) {
    await db.run(`CREATE UNIQUE INDEX IF NOT EXISTS
      idx_article_discussions_${column}
      ON article_discussions(${column})
      WHERE ${column} IS NOT NULL`);
  }
}

export async function applyArticleDiscussionRepair(db, report) {
  const tables = {
    notifications: await tableExists(db, 'notifications'),
    reads: await tableExists(db, 'discussion_topic_reads')
  };

  await db.run('BEGIN IMMEDIATE');
  try {
    for (const group of report.duplicates) {
      const [primary, ...duplicates] = group;
      for (const duplicate of duplicates) {
        await moveTopicReferences(db, primary.topic_id, duplicate.topic_id, tables);
      }
    }

    for (const row of report.empty) {
      await removeEmptyDiscussion(db, row.topic_id, tables);
    }

    await createUniqueIndexes(db);
    await db.run('COMMIT');
  } catch (error) {
    await db.run('ROLLBACK');
    throw error;
  }
}

export async function inspectArticleDiscussions(db) {
  const rows = await db.all(`SELECT ad.*, t.created_at AS topic_created_at,
    (SELECT COUNT(*) FROM discussion_messages m WHERE m.topic_id = ad.topic_id) AS messages_count
    FROM article_discussions ad
    JOIN discussion_topics t ON t.id = ad.topic_id
    ORDER BY ad.topic_id`);

  const empty = rows.filter(row => !hasArticleIdentity(row));
  const groups = new Map();

  for (const row of rows.filter(hasArticleIdentity)) {
    const key = articleKey(row);
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }

  const duplicates = [...groups.values()]
    .filter(group => group.length > 1)
    .map(group => group.sort((left, right) =>
      Number(right.messages_count || 0) - Number(left.messages_count || 0) ||
      String(left.topic_created_at || '').localeCompare(String(right.topic_created_at || '')) ||
      Number(left.topic_id) - Number(right.topic_id)
    ));

  return { rows, empty, duplicates };
}

export async function repairArticleDiscussions({ databasePath, apply = false, log = console.log }) {
  const db = await openDatabase(databasePath);

  try {
    const report = await inspectArticleDiscussions(db);
    const unsafeEmpty = report.empty.filter(row => Number(row.messages_count || 0) > 0);

    log(`Article discussions: ${report.rows.length}`);
    log(`Duplicate article pairs: ${report.duplicates.length}`);
    log(`Empty article links: ${report.empty.length}`);

    for (const group of report.duplicates) {
      log(`Duplicate topics: ${group.map(row => row.topic_id).join(', ')} (keep ${group[0].topic_id})`);
    }
    for (const row of report.empty) {
      log(`Empty topic: ${row.topic_id}; messages: ${row.messages_count}`);
    }

    if (unsafeEmpty.length) {
      throw new Error(
        `Refusing to remove empty article links with messages: ${unsafeEmpty.map(row => row.topic_id).join(', ')}`
      );
    }

    if (!apply) {
      log('Dry run passed. Nothing changed. Run again with --apply.');
      return { ...report, applied: false, backupPath: null };
    }

    const backupDirectory = path.join(path.dirname(databasePath), 'backups');
    const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    const backupPath = path.join(backupDirectory, `gostinaya-before-article-repair-${timestamp}.db`);
    await mkdir(backupDirectory, { recursive: true });
    // VACUUM INTO includes committed WAL pages and produces a consistent,
    // standalone SQLite backup without stopping the application first.
    await db.run(`VACUUM INTO ${sqlString(backupPath)}`);

    await applyArticleDiscussionRepair(db, report);

    const after = await inspectArticleDiscussions(db);
    if (after.duplicates.length || after.empty.length) {
      throw new Error('Post-repair verification failed');
    }

    log(`Backup: ${backupPath}`);
    log(`Article discussions after repair: ${after.rows.length}`);
    log('Repair completed and verified.');
    return { ...after, applied: true, backupPath };
  } finally {
    await db.close();
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const databasePath = process.env.GOSTINAYA_DB_PATH ||
    path.join(__dirname, '..', 'database', 'gostinaya.db');
  await repairArticleDiscussions({ databasePath, apply });
}

if (process.argv[1] && fileURLToPath(new URL(`file://${process.argv[1]}`)) === __filename) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
