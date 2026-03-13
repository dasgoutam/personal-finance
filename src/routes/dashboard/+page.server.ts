import { redirect } from '@sveltejs/kit';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { accounts, accountTypes, journalEntries, transactions } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}

	// Recent transactions with the count of journal entry legs
	const recentTransactions = await db
		.select({
			id: transactions.id,
			date: transactions.date,
			description: transactions.description,
			notes: transactions.notes,
			entryCount: sql<number>`count(${journalEntries.id})`
		})
		.from(transactions)
		.leftJoin(journalEntries, eq(journalEntries.transactionId, transactions.id))
		.groupBy(transactions.id)
		.orderBy(desc(transactions.date), desc(transactions.id))
		.limit(20);

	// Per-account balances with type info
	const accountBalances = await db
		.select({
			id: accounts.id,
			name: accounts.name,
			currency: accounts.currency,
			typeName: accountTypes.name,
			typeCategory: accountTypes.category,
			balance: sql<number>`coalesce(sum(${journalEntries.amount}), 0)`
		})
		.from(accounts)
		.innerJoin(accountTypes, eq(accountTypes.id, accounts.accountTypeId))
		.leftJoin(journalEntries, eq(journalEntries.accountId, accounts.id))
		.where(eq(accounts.isActive, true))
		.groupBy(accounts.id)
		.orderBy(accountTypes.name, accounts.name);

	return { recentTransactions, accountBalances };
};
