import db from './db.js';

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS discussion_topic_reads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guest_id INTEGER NOT NULL,
      topic_id INTEGER NOT NULL,
      last_read_message_id INTEGER,
      last_read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(guest_id, topic_id),
      FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE CASCADE,
      FOREIGN KEY (topic_id) REFERENCES discussion_topics(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_topic_reads_guest
    ON discussion_topic_reads(guest_id)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_topic_reads_topic
    ON discussion_topic_reads(topic_id)
  `);

  console.log('Миграция discussion_topic_reads завершена');
});
