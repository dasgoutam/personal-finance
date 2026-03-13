import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import * as schema from './schema';

const dbPath = resolve(process.env.DATABASE_URL ?? './data/finance.db');
const dbDir = dirname(dbPath);

if (!existsSync(dbDir)) {
	mkdirSync(dbDir, { recursive: true });
}

export const sqlite = new Database(dbPath);

// WAL mode for better concurrent read performance on Raspberry Pi
sqlite.pragma('journal_mode = WAL');
// Enforce foreign-key constraints (SQLite disables them by default)
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
