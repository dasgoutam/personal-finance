/**
 * Applies all pending Drizzle migrations to the database.
 * Run after: npm run db:generate
 * Usage:    npm run db:migrate
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { existsSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';

const dbPath = resolve(process.env.DATABASE_URL ?? './data/finance.db');
const dbDir = dirname(dbPath);

if (!existsSync(dbDir)) {
	mkdirSync(dbDir, { recursive: true });
}

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
// Disable FK checks during schema migrations (table drops/renames need it);
// the app re-enables FK checks at runtime in src/lib/server/db/index.ts
sqlite.pragma('foreign_keys = OFF');

const db = drizzle(sqlite);

migrate(db, { migrationsFolder: './drizzle/migrations' });

sqlite.pragma('foreign_keys = ON');
console.log('Migrations applied successfully.');
sqlite.close();
