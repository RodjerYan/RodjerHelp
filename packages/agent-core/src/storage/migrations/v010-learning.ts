import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration: Migration = {
  version: 10,
  up: (db: Database) => {
    db.exec(`
      ALTER TABLE app_settings
      ADD COLUMN self_learning_enabled INTEGER NOT NULL DEFAULT 1
    `);

    db.exec(`
      ALTER TABLE app_settings
      ADD COLUMN auto_apply_learning INTEGER NOT NULL DEFAULT 1
    `);

    db.exec(`
      CREATE TABLE learning_insights (
        id TEXT PRIMARY KEY,
        insight_key TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        confidence REAL NOT NULL DEFAULT 0.5,
        occurrence_count INTEGER NOT NULL DEFAULT 1,
        source_task_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    db.exec(`
      CREATE INDEX idx_learning_insights_updated
      ON learning_insights(updated_at DESC)
    `);
  },
};
