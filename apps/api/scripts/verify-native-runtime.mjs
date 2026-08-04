import Database from 'better-sqlite3';

const database = new Database(':memory:');
try {
  const result = database.prepare('SELECT 1 AS ok').get();
  if (result?.ok !== 1) throw new Error('Unexpected SQLite query result.');
  console.log(
    JSON.stringify({
      status: 'ok',
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
      sqliteVersion: database.prepare('SELECT sqlite_version() AS version').get().version
    })
  );
} finally {
  database.close();
}
