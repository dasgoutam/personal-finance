import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

// ---------------------------------------------------------------------------
// Lucia auth tables
// ---------------------------------------------------------------------------

export const users = sqliteTable('users', {
	id: text('id').primaryKey(),
	username: text('username').notNull().unique(),
	hashedPassword: text('hashed_password').notNull()
});

export const sessions = sqliteTable('sessions', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: integer('expires_at').notNull()
});

// ---------------------------------------------------------------------------
// Account types
// ---------------------------------------------------------------------------

export const ACCOUNT_CATEGORIES = [
	'asset',
	'liability',
	'equity',
	'income',
	'expense'
] as const;
export type AccountCategory = (typeof ACCOUNT_CATEGORIES)[number];

/**
 * User-manageable account type taxonomy.
 * Default types are pre-seeded and cannot be deleted.
 * Users can add custom types (and sub-types via parentId).
 */
export const accountTypes = sqliteTable('account_types', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull().unique(),
	/** Accounting category — drives debit/credit normal and net-worth logic */
	category: text('category', { enum: ACCOUNT_CATEGORIES }).notNull(),
	/** Optional parent for sub-categories (e.g. Stocks/ETF/Crypto under Equity) */
	parentId: integer('parent_id').references((): AnySQLiteColumn => accountTypes.id),
	/** Default types cannot be deleted through the UI */
	isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false)
});

// ---------------------------------------------------------------------------
// Finance tables
// ---------------------------------------------------------------------------

/**
 * Chart of accounts — flat structure.
 * Hierarchy/grouping is handled by account_types, not by a parent_id on accounts.
 */
export const accounts = sqliteTable('accounts', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	accountTypeId: integer('account_type_id')
		.notNull()
		.references(() => accountTypes.id),
	/** ISO 4217 currency code, e.g. "EUR", "INR" */
	currency: text('currency').notNull().default('EUR'),
	description: text('description'),
	isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`)
});

/**
 * A transaction groups journal entries that must balance to zero.
 */
export const transactions = sqliteTable('transactions', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	date: text('date').notNull(),
	description: text('description').notNull(),
	notes: text('notes'),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`)
});

/**
 * Tradeable instruments (stocks, ETFs, mutual funds, crypto).
 */
export const commodities = sqliteTable('commodities', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	symbol: text('symbol').notNull().unique(),
	name: text('name').notNull(),
	currency: text('currency').notNull()
});

/**
 * Individual legs of a double-entry transaction.
 * amount is in smallest currency unit. Positive = debit, negative = credit.
 */
export const journalEntries = sqliteTable('journal_entries', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	transactionId: integer('transaction_id')
		.notNull()
		.references(() => transactions.id, { onDelete: 'cascade' }),
	accountId: integer('account_id')
		.notNull()
		.references(() => accounts.id),
	amount: integer('amount').notNull(),
	currency: text('currency').notNull(),
	commodityId: integer('commodity_id').references(() => commodities.id),
	quantity: integer('quantity')
});

/**
 * Historical price series for commodities.
 */
export const prices = sqliteTable('prices', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	commodityId: integer('commodity_id')
		.notNull()
		.references(() => commodities.id, { onDelete: 'cascade' }),
	date: text('date').notNull(),
	price: integer('price').notNull(),
	currency: text('currency').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`)
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type AccountType = typeof accountTypes.$inferSelect;
export type NewAccountType = typeof accountTypes.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type JournalEntry = typeof journalEntries.$inferSelect;
export type NewJournalEntry = typeof journalEntries.$inferInsert;
export type Commodity = typeof commodities.$inferSelect;
export type NewCommodity = typeof commodities.$inferInsert;
export type Price = typeof prices.$inferSelect;
export type NewPrice = typeof prices.$inferInsert;
