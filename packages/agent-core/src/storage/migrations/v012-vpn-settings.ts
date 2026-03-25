import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration: Migration = {
  version: 12,
  up: (db: Database) => {
    db.exec(`ALTER TABLE app_settings ADD COLUMN vpn_enabled INTEGER NOT NULL DEFAULT 0`);
    db.exec(`ALTER TABLE app_settings ADD COLUMN vpn_auto_connect INTEGER NOT NULL DEFAULT 0`);
    db.exec(`ALTER TABLE app_settings ADD COLUMN vpn_require_tunnel INTEGER NOT NULL DEFAULT 0`);
    db.exec(`ALTER TABLE app_settings ADD COLUMN vpn_kill_switch INTEGER NOT NULL DEFAULT 0`);
  },
};
