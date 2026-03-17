try {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.prepare('select 1').get();
  db.close();

  require('node-pty');

  console.log('[desktop] Electron native module validation passed');
  process.exit(0);
} catch (error) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error('[desktop] Electron native module validation failed');
  console.error(message);
  process.exit(1);
}
