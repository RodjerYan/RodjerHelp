import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration: Migration = {
  version: 11,
  up: (db: Database) => {
    db.exec(`
      ALTER TABLE tasks
      ADD COLUMN task_mode TEXT
    `);

    db.exec(`
      ALTER TABLE tasks
      ADD COLUMN memory_context TEXT
    `);

    db.exec(`
      ALTER TABLE learning_insights
      ADD COLUMN scope_key TEXT NOT NULL DEFAULT 'global'
    `);

    db.exec(`
      ALTER TABLE learning_insights
      ADD COLUMN scope_label TEXT
    `);

    db.exec(`
      CREATE INDEX idx_learning_insights_scope
      ON learning_insights(scope_key, updated_at DESC)
    `);
  },
};
