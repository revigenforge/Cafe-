import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DB_PATH =
  process.env.CRM_DB_PATH || path.join(__dirname, '..', '..', 'data', 'crm.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);

/* WAL lets reads continue while a write is in flight, which matters
   once several salespeople are working the queue at once. */
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/** Apply schema.sql. Safe to run repeatedly — every statement is IF NOT EXISTS. */
export function applySchema() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(sql);
}

/** Run fn inside a transaction, rolling back if it throws. */
export function tx(fn) {
  return db.transaction(fn);
}

export default db;
