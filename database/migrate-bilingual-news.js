import db from './db.js';

function tableColumns(table) {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${table})`, (error, rows) => {
      if (error) reject(error);
      else resolve(rows || []);
    });
  });
}

function run(sql) {
  return new Promise((resolve, reject) => {
    db.run(sql, error => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function migrate() {
  const columns = await tableColumns('discussion_topics');
  const names = new Set(columns.map(column => column.name));

  const additions = [
    ['title_ru', 'TEXT'],
    ['title_en', 'TEXT'],
    ['body_ru', 'TEXT'],
    ['body_en', 'TEXT']
  ];

  for (const [name, type] of additions) {
    if (!names.has(name)) {
      await run(`ALTER TABLE discussion_topics ADD COLUMN ${name} ${type}`);
      console.log(`Added discussion_topics.${name}`);
    }
  }

  console.log('Bilingual project news migration completed');
  db.close();
}

migrate().catch(error => {
  console.error('Bilingual project news migration failed:', error);
  db.close();
  process.exitCode = 1;
});
