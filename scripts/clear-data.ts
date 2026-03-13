/**
 * Deletes all finance data (accounts, transactions, journal entries,
 * commodities, prices) while preserving the user login.
 *
 * Usage: npm run db:clear
 *
 * Environment variables:
 *   DATABASE_URL   Path to SQLite file (default: ./data/finance.db)
 */
import Database from 'better-sqlite3';
import { existsSync } from 'fs';
import { resolve } from 'path';

const dbPath = resolve(process.env.DATABASE_URL ?? './data/finance.db');

if (!existsSync(dbPath)) {
	console.error(`Database not found at ${dbPath}`);
	process.exit(1);
}

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

sqlite
	.transaction(() => {
		// Delete in FK-safe order
		sqlite.prepare('DELETE FROM prices').run();
		sqlite.prepare('DELETE FROM journal_entries').run();
		sqlite.prepare('DELETE FROM transactions').run();
		sqlite.prepare('DELETE FROM commodities').run();
		sqlite.prepare('DELETE FROM accounts').run();

		// Reset autoincrement counters
		sqlite.prepare("DELETE FROM sqlite_sequence WHERE name IN ('prices','journal_entries','transactions','commodities','accounts')").run();
	})
	.immediate();

console.log('All finance data cleared. User login preserved.');
console.log('You can now add your own accounts and transactions.');

sqlite.close();
